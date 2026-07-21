import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryDeliveryType, CloudinaryResourceType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  v2 as cloudinary,
  type UploadApiErrorResponse,
  type UploadApiResponse,
} from 'cloudinary';
import type {
  UploadedRentalAsset,
  ValidatedPrescriptionFile,
} from './rental-documents.types';

@Injectable()
export class RentalDocumentsCloudinaryService {
  constructor(private readonly configService: ConfigService) {
    this.configureCloudinary();
  }

  async uploadPrescription(
    file: ValidatedPrescriptionFile,
    userId: number,
  ): Promise<UploadedRentalAsset> {
    const resourceType = this.toCloudinaryResourceType(file.resourceType);
    const folder = this.getRentalDocumentsFolder();
    const identifier = randomUUID();
    const publicId =
      file.resourceType === CloudinaryResourceType.RAW
        ? `${identifier}.${file.format}`
        : identifier;

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: resourceType,
          type: 'authenticated',
          folder: `${folder}/temp/${userId}`,
          public_id: publicId,
          filename_override: file.originalFilename,
          overwrite: false,
          use_filename: false,
          unique_filename: false,
        },
        (
          error: UploadApiErrorResponse | undefined,
          uploaded: UploadApiResponse | undefined,
        ) => {
          if (error || !uploaded) {
            reject(
              new InternalServerErrorException(
                'No se pudo subir la receta al almacenamiento protegido',
              ),
            );
            return;
          }

          resolve(uploaded);
        },
      );
      stream.end(file.buffer);
    });

    const assetId: unknown = result.asset_id;
    if (typeof assetId !== 'string' || !assetId || !result.public_id) {
      throw new InternalServerErrorException(
        'Cloudinary no devolvio identificadores validos para la receta',
      );
    }

    return {
      assetId,
      publicId: result.public_id,
      resourceType: file.resourceType,
      deliveryType: CloudinaryDeliveryType.AUTHENTICATED,
      format: result.format || file.format,
      bytes: result.bytes || file.bytes,
    };
  }

  async deleteAsset(asset: UploadedRentalAsset) {
    const result = (await cloudinary.uploader.destroy(asset.publicId, {
      resource_type: this.toCloudinaryResourceType(asset.resourceType),
      type: this.toCloudinaryDeliveryType(asset.deliveryType),
      invalidate: true,
    })) as { result?: string };

    if (result.result && !['ok', 'not found'].includes(result.result)) {
      throw new Error(`Cloudinary no elimino el activo: ${result.result}`);
    }
  }

  async downloadAuthenticatedAsset(
    asset: UploadedRentalAsset,
    attachment: boolean,
  ) {
    const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;
    const url = cloudinary.utils.private_download_url(
      asset.publicId,
      asset.format,
      {
        resource_type: this.toCloudinaryResourceType(asset.resourceType),
        type: this.toCloudinaryDeliveryType(asset.deliveryType),
        expires_at: expiresAt,
        attachment,
      },
    );
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      throw new InternalServerErrorException(
        'No se pudo obtener temporalmente la receta',
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private configureCloudinary() {
    const cloudinaryUrl = this.configService
      .get<string>('CLOUDINARY_URL')
      ?.trim();
    if (!cloudinaryUrl) {
      return;
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

    const cloudName = parsed.hostname.trim();
    const apiKey = decodeURIComponent(parsed.username).replace(/[<>]/g, '');
    const apiSecret = decodeURIComponent(parsed.password).replace(/[<>]/g, '');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new InternalServerErrorException(
        'CLOUDINARY_URL debe incluir cloud name, api key y api secret',
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }

  private getRentalDocumentsFolder() {
    return (
      this.configService
        .get<string>('CLOUDINARY_RENTAL_DOCUMENTS_FOLDER')
        ?.trim() || 'cemydi/recetas'
    ).replace(/^\/+|\/+$/g, '');
  }

  private toCloudinaryResourceType(value: CloudinaryResourceType) {
    return value === CloudinaryResourceType.RAW
      ? ('raw' as const)
      : ('image' as const);
  }

  private toCloudinaryDeliveryType(value: CloudinaryDeliveryType) {
    if (value !== CloudinaryDeliveryType.AUTHENTICATED) {
      throw new InternalServerErrorException(
        'Tipo de entrega Cloudinary no soportado',
      );
    }

    return 'authenticated' as const;
  }
}
