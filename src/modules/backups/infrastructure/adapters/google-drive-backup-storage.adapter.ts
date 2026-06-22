import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { BackupStoragePort } from '../../domain/ports/backup-storage.port';
import { GoogleDriveProvider } from '../../dto/backups.types';

type GoogleDriveClientContext = {
  provider: GoogleDriveProvider;
  drive: ReturnType<typeof google.drive>;
};

@Injectable()
export class GoogleDriveBackupStorageAdapter implements BackupStoragePort {
  private readonly logger = new Logger(GoogleDriveBackupStorageAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  getPrimaryProvider(): GoogleDriveProvider {
    return this.getConfiguredGoogleDriveProviders()[0];
  }

  async uploadBackup(fileName: string, content: Buffer) {
    const folderId = this.getGoogleDriveFolderId();

    try {
      await this.runWithGoogleDriveClient(
        'subir el respaldo',
        async ({ drive }) => {
          await drive.files.create({
            requestBody: {
              name: fileName,
              parents: [folderId],
            },
            media: {
              mimeType: 'application/x-tar',
              body: Readable.from(content),
            },
            supportsAllDrives: true,
          });
        },
      );
    } catch (error) {
      throw this.wrapGoogleDriveError(
        error,
        'No se pudo subir el respaldo a Google Drive',
      );
    }
  }

  async downloadBackup(fileName: string) {
    const driveFileId = await this.findDriveFileIdByName(fileName);
    if (!driveFileId) {
      throw new NotFoundException(
        `No se encontro el respaldo ${fileName} dentro de la carpeta de Google Drive configurada`,
      );
    }

    try {
      const response = await this.runWithGoogleDriveClient(
        `descargar el respaldo ${fileName}`,
        async ({ drive }) =>
          (await drive.files.get(
            {
              fileId: driveFileId,
              alt: 'media',
              supportsAllDrives: true,
            },
            {
              responseType: 'stream',
            },
          )) as { data: NodeJS.ReadableStream },
      );

      return await this.readStreamToBuffer(response.data);
    } catch (error) {
      const wrapped = this.wrapGoogleDriveError(
        error,
        `No se pudo descargar el respaldo ${fileName} desde Google Drive`,
      );

      if (this.isGoogleDriveFileMissing(error)) {
        throw new NotFoundException(
          'El archivo del respaldo ya no existe en Google Drive',
        );
      }

      throw wrapped;
    }
  }

  async deleteBackup(fileName: string) {
    const driveFileId = await this.findDriveFileIdByName(fileName, {
      allowMissing: true,
    });

    if (!driveFileId) {
      return;
    }

    try {
      await this.runWithGoogleDriveClient(
        'eliminar el respaldo',
        async ({ drive }) => {
          await drive.files.delete({
            fileId: driveFileId,
            supportsAllDrives: true,
          });
        },
      );
    } catch (error) {
      if (this.isGoogleDriveFileMissing(error)) {
        return;
      }

      throw this.wrapGoogleDriveError(
        error,
        'No se pudo eliminar el respaldo en Google Drive',
      );
    }
  }

  shouldKeepDeletionLocal(error: unknown) {
    const status = this.extractGoogleDriveStatus(error);
    if (status === 401 || status === 403) {
      return true;
    }

    const message = this.extractGoogleDriveErrorMessage(error).toLowerCase();
    return (
      message.includes('invalid_grant') ||
      message.includes('invalid credentials') ||
      message.includes('unauthorized') ||
      message.includes('insufficient authentication') ||
      message.includes('token has been expired or revoked')
    );
  }

  private getConfiguredGoogleDriveProviders(): GoogleDriveProvider[] {
    const preferredProvider = this.configService
      .get<string>('GOOGLE_DRIVE_PROVIDER')
      ?.trim()
      .toLowerCase();
    const providers: GoogleDriveProvider[] = [];

    const clientId = this.configService
      .get<string>('GOOGLE_OAUTH_CLIENT_ID')
      ?.trim();
    const clientSecret = this.configService
      .get<string>('GOOGLE_OAUTH_CLIENT_SECRET')
      ?.trim();
    const refreshToken = this.configService
      .get<string>('GOOGLE_OAUTH_REFRESH_TOKEN')
      ?.trim();
    if (clientId && clientSecret && refreshToken) {
      providers.push('oauth2');
    }

    const clientEmail = this.configService
      .get<string>('GOOGLE_DRIVE_CLIENT_EMAIL')
      ?.trim();
    const privateKey = this.configService
      .get<string>('GOOGLE_DRIVE_PRIVATE_KEY')
      ?.trim();
    if (clientEmail && privateKey) {
      providers.push('service-account');
    }

    if (
      preferredProvider &&
      preferredProvider !== 'oauth2' &&
      preferredProvider !== 'service-account'
    ) {
      throw new InternalServerErrorException(
        'Configura GOOGLE_DRIVE_PROVIDER con uno de estos valores: oauth2 o service-account',
      );
    }

    if (preferredProvider) {
      if (!providers.includes(preferredProvider as GoogleDriveProvider)) {
        throw new InternalServerErrorException(
          preferredProvider === 'oauth2'
            ? 'Configura GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET y GOOGLE_OAUTH_REFRESH_TOKEN para usar GOOGLE_DRIVE_PROVIDER=oauth2'
            : 'Configura GOOGLE_DRIVE_CLIENT_EMAIL y GOOGLE_DRIVE_PRIVATE_KEY para usar GOOGLE_DRIVE_PROVIDER=service-account',
        );
      }

      return [preferredProvider as GoogleDriveProvider];
    }

    if (providers.length > 0) {
      return providers;
    }

    throw new InternalServerErrorException(
      'Configura GOOGLE_DRIVE_CLIENT_EMAIL y GOOGLE_DRIVE_PRIVATE_KEY o bien GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET y GOOGLE_OAUTH_REFRESH_TOKEN para usar respaldos en Google Drive',
    );
  }

  private createGoogleDriveClient(
    provider: GoogleDriveProvider = this.getPrimaryProvider(),
  ) {
    if (provider === 'service-account') {
      const clientEmail = this.configService
        .get<string>('GOOGLE_DRIVE_CLIENT_EMAIL')
        ?.trim();
      const rawPrivateKey = this.configService
        .get<string>('GOOGLE_DRIVE_PRIVATE_KEY')
        ?.trim();

      if (!clientEmail || !rawPrivateKey) {
        throw new InternalServerErrorException(
          'Configura GOOGLE_DRIVE_CLIENT_EMAIL y GOOGLE_DRIVE_PRIVATE_KEY para usar respaldos en Google Drive con service account',
        );
      }

      const auth = new google.auth.JWT({
        email: clientEmail,
        key: rawPrivateKey.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/drive'],
      });

      return google.drive({
        version: 'v3',
        auth,
      });
    }

    const clientId = this.configService
      .get<string>('GOOGLE_OAUTH_CLIENT_ID')
      ?.trim();
    const clientSecret = this.configService
      .get<string>('GOOGLE_OAUTH_CLIENT_SECRET')
      ?.trim();
    const redirectUri =
      this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URI')?.trim() ||
      'http://127.0.0.1:3005/oauth2callback';
    const refreshToken = this.configService
      .get<string>('GOOGLE_OAUTH_REFRESH_TOKEN')
      ?.trim();

    if (!clientId || !clientSecret || !refreshToken) {
      throw new InternalServerErrorException(
        'Configura GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET y GOOGLE_OAUTH_REFRESH_TOKEN para usar respaldos en Google Drive con OAuth 2.0',
      );
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    auth.setCredentials({
      refresh_token: refreshToken,
    });

    return google.drive({
      version: 'v3',
      auth,
    });
  }

  private getGoogleDriveFolderId() {
    const folderId = this.configService
      .get<string>('GOOGLE_DRIVE_FOLDER_ID')
      ?.trim();
    if (!folderId) {
      throw new InternalServerErrorException(
        'Configura GOOGLE_DRIVE_FOLDER_ID para guardar respaldos en Google Drive',
      );
    }

    return folderId;
  }

  private async runWithGoogleDriveClient<T>(
    operationName: string,
    callback: (client: GoogleDriveClientContext) => Promise<T>,
  ) {
    const providers = this.getConfiguredGoogleDriveProviders();
    let lastError: unknown = null;

    for (let index = 0; index < providers.length; index += 1) {
      const provider = providers[index];

      try {
        return await callback({
          provider,
          drive: this.createGoogleDriveClient(provider),
        });
      } catch (error) {
        lastError = error;
        const hasNextProvider = index < providers.length - 1;

        if (
          hasNextProvider &&
          this.shouldRetryWithNextGoogleDriveProvider(error)
        ) {
          const detail =
            error instanceof Error && error.message.trim()
              ? error.message.trim()
              : 'Error desconocido';
          this.logger.warn(
            `Google Drive fallo con ${provider} al ${operationName}. Se intentara el siguiente proveedor configurado. Motivo: ${detail}`,
          );
          continue;
        }

        throw error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new InternalServerErrorException(
      `No se pudo ${operationName} en Google Drive`,
    );
  }

  private async findDriveFileIdByName(
    fileName: string,
    options?: { allowMissing?: boolean },
  ) {
    const folderId = this.getGoogleDriveFolderId();

    try {
      const response = await this.runWithGoogleDriveClient(
        `ubicar el respaldo ${fileName}`,
        async ({ drive }) =>
          drive.files.list({
            q: [
              `'${folderId}' in parents`,
              `name = '${this.escapeDriveQueryValue(fileName)}'`,
              'trashed = false',
            ].join(' and '),
            pageSize: 1,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc',
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
          }),
      );

      const fileId = response.data.files?.[0]?.id?.trim();
      if (fileId) {
        return fileId;
      }

      if (options?.allowMissing) {
        return null;
      }

      throw new NotFoundException(
        `No se encontro el respaldo ${fileName} dentro de la carpeta de Google Drive configurada`,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw this.wrapGoogleDriveError(
        error,
        `No se pudo ubicar el respaldo ${fileName} en Google Drive`,
      );
    }
  }

  private async readStreamToBuffer(stream: NodeJS.ReadableStream) {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];

      stream.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      stream.on('error', (error) => {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Error desconocido al leer el archivo';
        reject(
          new InternalServerErrorException(
            `No se pudo leer el archivo de Google Drive: ${errorMessage}`,
          ),
        );
      });
    });
  }

  private escapeDriveQueryValue(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private isGoogleDriveFileMissing(error: unknown) {
    return (
      error instanceof NotFoundException ||
      this.extractGoogleDriveStatus(error) === 404
    );
  }

  private shouldRetryWithNextGoogleDriveProvider(error: unknown) {
    const status = this.extractGoogleDriveStatus(error);
    if (status === 401 || status === 403) {
      return true;
    }

    const message = this.extractGoogleDriveErrorMessage(error);
    if (!message) {
      return false;
    }

    const normalized = message.toLowerCase();
    return (
      normalized.includes('invalid_grant') ||
      normalized.includes('invalid credentials') ||
      normalized.includes('unauthorized') ||
      normalized.includes('insufficient authentication') ||
      normalized.includes('token has been expired or revoked')
    );
  }

  private extractGoogleDriveStatus(error: unknown) {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const candidate = error as {
      code?: number;
      status?: number;
      response?: { status?: number };
    };

    return candidate.code ?? candidate.status ?? candidate.response?.status;
  }

  private extractGoogleDriveErrorMessage(error: unknown) {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    if (!error || typeof error !== 'object') {
      return '';
    }

    const candidate = error as {
      response?: {
        data?: {
          error?: string | { message?: string };
          error_description?: string;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    const responseError = candidate.response?.data?.error;
    if (typeof responseError === 'string' && responseError.trim()) {
      return responseError.trim();
    }

    const nestedMessage =
      typeof responseError === 'object' && responseError?.message?.trim()
        ? responseError.message.trim()
        : '';
    if (nestedMessage) {
      return nestedMessage;
    }

    const errorDescription =
      candidate.response?.data?.error_description?.trim();
    if (errorDescription) {
      return errorDescription;
    }

    const arrayMessage = candidate.errors?.[0]?.message?.trim();
    return arrayMessage || '';
  }

  private wrapGoogleDriveError(error: unknown, fallbackMessage: string) {
    if (error instanceof InternalServerErrorException) {
      return error;
    }

    if (error instanceof Error && error.message.trim()) {
      return new InternalServerErrorException(
        `${fallbackMessage}: ${error.message.trim()}`,
      );
    }

    return new InternalServerErrorException(fallbackMessage);
  }
}
