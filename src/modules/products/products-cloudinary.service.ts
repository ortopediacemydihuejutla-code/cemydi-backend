import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { assertImageBufferMagicBytes } from '../../common/files/image-magic-bytes.util';
import { sanitizeFileName } from '../../common/files/safe-file-name.util';
import { MAX_IMAGE_UPLOAD_BYTES } from '../../common/files/upload-limits.constants';
import type {
  UploadedProductFile,
  UploadedProductImage,
} from './products-cloudinary.types';

type CloudinaryCredentials = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

@Injectable()
export class ProductsCloudinaryService {
  private readonly logger = new Logger(ProductsCloudinaryService.name);

  constructor(private readonly configService: ConfigService) {}

  validateImageOperation(imageUrls: string[], files: UploadedProductFile[]) {
    const total = imageUrls.length + files.length;
    if (total > 10) {
      throw new BadRequestException(
        'Solo se permiten hasta 10 imagenes por producto',
      );
    }

    for (const file of files) {
      assertImageBufferMagicBytes(file.buffer, `archivo ${file.originalname}`);

      if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
        throw new BadRequestException(
          'Cada imagen debe pesar como maximo 8 MB',
        );
      }
    }
  }

  async uploadProductImages(imageUrls: string[], files: UploadedProductFile[]) {
    const uploaded: UploadedProductImage[] = [];

    try {
      for (const imageUrl of imageUrls) {
        uploaded.push(await this.uploadRemoteImageToCloudinary(imageUrl));
      }

      for (const file of files) {
        uploaded.push(await this.uploadFileToCloudinary(file));
      }

      return uploaded;
    } catch (error) {
      await this.deleteUploadedImagesQuietly(uploaded);
      throw error;
    }
  }

  async uploadPromotionImage(file: UploadedProductFile) {
    this.validateImageOperation([], [file]);
    return this.uploadFileToCloudinary(
      file,
      this.getCloudinaryPromotionFolder(),
    );
  }

  async deleteUploadedImagesQuietly(images: UploadedProductImage[]) {
    await Promise.all(
      images
        .filter((image) => image.cloudinaryPublicId)
        .map((image) =>
          this.deleteCloudinaryImage(image.cloudinaryPublicId!).catch(
            (error) => {
              const message =
                error instanceof Error
                  ? error.message
                  : 'Error desconocido al limpiar imagen de Cloudinary';
              this.logger.warn(
                `No se pudo revertir la imagen subida del producto: ${message}`,
              );
            },
          ),
        ),
    );
  }

  async deleteCloudinaryImagesQuietly(
    images: Array<{ cloudinaryPublicId: string | null }>,
  ) {
    await Promise.all(
      images
        .filter((image) => image.cloudinaryPublicId)
        .map((image) =>
          this.deleteCloudinaryImage(image.cloudinaryPublicId!).catch(
            (error) => {
              const message =
                error instanceof Error
                  ? error.message
                  : 'Error desconocido al eliminar imagen de Cloudinary';
              this.logger.warn(
                `No se pudo eliminar una imagen de producto en Cloudinary: ${message}`,
              );
            },
          ),
        ),
    );
  }

  async deleteCloudinaryImagesStrictly(
    images: Array<{ cloudinaryPublicId: string | null }>,
  ) {
    const publicIds = images
      .map((image) => image.cloudinaryPublicId)
      .filter((publicId): publicId is string => Boolean(publicId));

    for (const publicId of publicIds) {
      try {
        await this.deleteCloudinaryImage(publicId);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error desconocido al eliminar imagen de Cloudinary';
        this.logger.error(
          `No se pudo eliminar la imagen ${publicId} de Cloudinary: ${message}`,
        );
        throw new InternalServerErrorException(
          `No se pudo eliminar la imagen del producto en Cloudinary: ${message}`,
        );
      }
    }
  }

  private async uploadRemoteImageToCloudinary(imageUrl: string) {
    try {
      const parsed = new URL(imageUrl);
      if (parsed.protocol !== 'https:') {
        throw new Error('La URL debe usar https');
      }

      if (!this.isAllowedRemoteImageHost(parsed.hostname)) {
        throw new Error('El dominio de la imagen no esta permitido');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'URL de imagen invalida';
      throw new BadRequestException(`URL de imagen invalida: ${message}`);
    }

    return this.uploadToCloudinary(imageUrl);
  }

  private async uploadFileToCloudinary(
    file: UploadedProductFile,
    folder?: string,
  ) {
    const bytes = new Uint8Array(file.buffer);
    const blob = new Blob([bytes], { type: file.mimetype });
    return this.uploadToCloudinary(
      blob,
      sanitizeFileName(file.originalname, 'imagen'),
      folder,
    );
  }

  private async uploadToCloudinary(
    file: string | Blob,
    fileName?: string,
    targetFolder?: string,
  ) {
    const credentials = this.getCloudinaryCredentials();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = targetFolder ?? this.getCloudinaryProductFolder();
    const publicId = randomUUID();
    const normalizedFileName = fileName?.trim() || '';
    const signature = this.signCloudinaryParams({
      filename_override: normalizedFileName,
      folder,
      public_id: publicId,
      timestamp: String(timestamp),
    });

    const form = new FormData();
    form.set('file', file);
    form.set('api_key', credentials.apiKey);
    form.set('timestamp', String(timestamp));
    form.set('folder', folder);
    form.set('public_id', publicId);
    form.set('signature', signature);
    if (normalizedFileName) {
      form.set('filename_override', normalizedFileName);
    }

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${credentials.cloudName}/image/upload`,
      {
        method: 'POST',
        body: form,
      },
    );

    const payload = (await response.json()) as {
      secure_url?: string;
      public_id?: string;
      error?: { message?: string };
    };

    if (!response.ok || !payload.secure_url) {
      const message =
        payload.error?.message || 'Cloudinary rechazo la imagen del producto';
      throw new InternalServerErrorException(
        `No se pudo subir la imagen del producto: ${message}`,
      );
    }

    return {
      imageUrl: payload.secure_url,
      cloudinaryPublicId: payload.public_id ?? null,
    };
  }

  private async deleteCloudinaryImage(publicId: string) {
    const credentials = this.getCloudinaryCredentials();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.signCloudinaryParams({
      invalidate: 'true',
      public_id: publicId,
      timestamp: String(timestamp),
    });

    const form = new FormData();
    form.set('api_key', credentials.apiKey);
    form.set('invalidate', 'true');
    form.set('public_id', publicId);
    form.set('timestamp', String(timestamp));
    form.set('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${credentials.cloudName}/image/destroy`,
      {
        method: 'POST',
        body: form,
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      result?: string;
      error?: { message?: string };
    } | null;

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ||
          `Cloudinary respondio con estado ${response.status}`,
      );
    }

    if (payload?.result && !['ok', 'not found'].includes(payload.result)) {
      throw new Error(
        `Cloudinary no confirmo la eliminacion de la imagen: ${payload.result}`,
      );
    }
  }

  private getCloudinaryCredentials(): CloudinaryCredentials {
    const cloudinaryUrl = this.configService
      .get<string>('CLOUDINARY_URL')
      ?.trim();
    if (!cloudinaryUrl) {
      throw new InternalServerErrorException(
        'Configura CLOUDINARY_URL para administrar imagenes de productos',
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(cloudinaryUrl);
    } catch {
      throw new InternalServerErrorException(
        'CLOUDINARY_URL no tiene un formato valido',
      );
    }

    if (parsed.protocol !== 'cloudinary:') {
      throw new InternalServerErrorException(
        'CLOUDINARY_URL debe iniciar con cloudinary://',
      );
    }

    const apiKey = decodeURIComponent(parsed.username).replace(/[<>]/g, '');
    const apiSecret = decodeURIComponent(parsed.password).replace(/[<>]/g, '');
    const cloudName = parsed.hostname.trim();

    if (!apiKey || !apiSecret || !cloudName) {
      throw new InternalServerErrorException(
        'CLOUDINARY_URL debe incluir cloud name, api key y api secret',
      );
    }

    return {
      cloudName,
      apiKey,
      apiSecret,
    };
  }

  private getCloudinaryProductFolder() {
    const configured = this.configService
      .get<string>('CLOUDINARY_PRODUCTS_FOLDER')
      ?.trim();
    return configured || 'cemydi/products';
  }

  private getCloudinaryPromotionFolder() {
    const configured = this.configService
      .get<string>('CLOUDINARY_PROMOTIONS_FOLDER')
      ?.trim();
    return configured || 'cemydi/promotions';
  }

  private isAllowedRemoteImageHost(hostname: string) {
    const configuredHosts = this.configService
      .get<string>('ALLOWED_REMOTE_IMAGE_HOSTS')
      ?.split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    const allowedHosts =
      configuredHosts && configuredHosts.length > 0
        ? configuredHosts
        : ['res.cloudinary.com', 'images.unsplash.com'];
    const normalizedHostname = hostname.toLowerCase();

    return allowedHosts.some(
      (allowedHost) =>
        normalizedHostname === allowedHost ||
        normalizedHostname.endsWith(`.${allowedHost}`),
    );
  }

  private signCloudinaryParams(params: Record<string, string>) {
    const credentials = this.getCloudinaryCredentials();
    const payload = Object.entries(params)
      .filter(([, value]) => value !== '')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return createHash('sha1')
      .update(`${payload}${credentials.apiSecret}`)
      .digest('hex');
  }
}
