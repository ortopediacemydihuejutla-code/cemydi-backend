import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CartItemMode,
  CloudinaryDeliveryType,
  CloudinaryResourceType,
  Prisma,
  RentalDocumentStatus,
  RentalRequestStatus,
  Rol,
} from '@prisma/client';
import { assertPrescriptionDocumentMagicBytes } from '../../common/files/image-magic-bytes.util';
import { MAX_PRESCRIPTION_UPLOAD_BYTES } from '../../common/files/upload-limits.constants';
import { sanitizeFileName } from '../../common/files/safe-file-name.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { RentalDocumentUploadRateLimitService } from './rental-document-upload-rate-limit.service';
import { RentalDocumentsCloudinaryService } from './rental-documents-cloudinary.service';
import type {
  PendingAssetCleanup,
  RentalDocumentSummary,
  UploadedPrescriptionFile,
  UploadedRentalAsset,
  ValidatedPrescriptionFile,
} from './rental-documents.types';

const ALLOWED_EXTENSIONS = new Map([
  ['pdf', 'application/pdf'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
]);

type StoredRentalDocument = UploadedRentalAsset & {
  id: string;
  originalFilename: string;
  mimeType: string;
  status: RentalDocumentStatus;
  uploadedAt: Date;
  associatedAt: Date | null;
};

@Injectable()
export class RentalDocumentsService {
  private readonly logger = new Logger(RentalDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cloudinary: RentalDocumentsCloudinaryService,
    private readonly uploadRateLimit: RentalDocumentUploadRateLimitService,
  ) {}

  async uploadForCartItem(
    currentUser: AuthUser,
    itemId: number,
    file: UploadedPrescriptionFile | undefined,
  ) {
    await this.uploadRateLimit.consume(currentUser.sub);
    const validated = this.validatePrescription(file);
    const db = this.prisma.forUser(currentUser);
    const item = await db.shoppingCartItem.findFirst({
      where: {
        id: itemId,
        mode: CartItemMode.RENTA,
        cart: { userId: currentUser.sub },
      },
      select: {
        id: true,
        product: { select: { requiereReceta: true } },
        rentalDocument: true,
      },
    });

    if (!item) {
      throw new NotFoundException(
        'Producto de renta no encontrado en el carrito',
      );
    }
    if (!item.product.requiereReceta) {
      throw new BadRequestException('Este producto no requiere receta');
    }

    const uploaded = await this.cloudinary.uploadPrescription(
      validated,
      currentUser.sub,
    );
    let previous: StoredRentalDocument | null = null;
    let saved: StoredRentalDocument;

    try {
      const cleanupAfter = new Date(
        Date.now() + this.getTemporaryTtlHours() * 60 * 60 * 1000,
      );
      saved = (await db.$transaction(async (tx) => {
        await this.lockUserRentalFlow(tx, currentUser.sub);
        const lockedItem = await tx.shoppingCartItem.findFirst({
          where: {
            id: itemId,
            mode: CartItemMode.RENTA,
            cart: { userId: currentUser.sub },
          },
          select: {
            id: true,
            product: { select: { requiereReceta: true } },
            rentalDocument: true,
          },
        });
        if (!lockedItem || !lockedItem.product.requiereReceta) {
          throw new ConflictException(
            'La renta cambio mientras se cargaba la receta. Actualiza el carrito e intenta de nuevo',
          );
        }
        previous = lockedItem.rentalDocument as StoredRentalDocument | null;

        return tx.rentalDocument.upsert({
          where: { shoppingCartItemId: itemId },
          create: {
            userId: currentUser.sub,
            shoppingCartItemId: itemId,
            ...this.assetData(uploaded),
            originalFilename: validated.originalFilename,
            mimeType: validated.mimeType,
            status: RentalDocumentStatus.PENDIENTE,
            cleanupAfter,
          },
          update: {
            ...this.assetData(uploaded),
            originalFilename: validated.originalFilename,
            mimeType: validated.mimeType,
            status: RentalDocumentStatus.PENDIENTE,
            uploadedAt: new Date(),
            associatedAt: null,
            cleanupAfter,
            reviewedAt: null,
            reviewedById: null,
            rejectionReason: null,
          },
        });
      })) as unknown as StoredRentalDocument;
    } catch (error) {
      await this.cloudinary.deleteAsset(uploaded).catch(() => undefined);
      throw error;
    }

    if (previous) {
      const previousAsset = this.toAsset(previous);
      try {
        await this.cloudinary.deleteAsset(previousAsset);
      } catch {
        this.logger.warn(
          'No se pudo eliminar de inmediato la receta reemplazada',
        );
        await this.appendPendingCleanup(saved.id, previousAsset);
      }
    }

    return {
      message: previous
        ? 'Receta reemplazada correctamente'
        : 'Receta adjuntada correctamente',
      document: this.mapSummary(saved),
    };
  }

  async uploadForRentalItem(
    currentUser: AuthUser,
    itemId: number,
    file: UploadedPrescriptionFile | undefined,
  ) {
    await this.uploadRateLimit.consume(currentUser.sub);
    const validated = this.validatePrescription(file);
    const db = this.prisma.forUser(currentUser);
    const item = await db.rentalRequestItem.findFirst({
      where: { id: itemId, rentalRequest: { userId: currentUser.sub } },
      select: {
        id: true,
        rentalRequestId: true,
        product: { select: { requiereReceta: true } },
        rentalRequest: { select: { status: true } },
        rentalDocument: true,
      },
    });

    this.assertRentalDocumentReplaceable(item);
    const uploaded = await this.cloudinary.uploadPrescription(
      validated,
      currentUser.sub,
    );
    let previous: StoredRentalDocument | null = null;
    let saved: StoredRentalDocument;

    try {
      saved = (await db.$transaction(async (tx) => {
        await this.lockUserRentalFlow(tx, currentUser.sub);
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM management.rental_requests
          WHERE id = ${item.rentalRequestId}
          FOR UPDATE
        `;
        const lockedItem = await tx.rentalRequestItem.findFirst({
          where: { id: itemId, rentalRequest: { userId: currentUser.sub } },
          select: {
            id: true,
            rentalRequestId: true,
            product: { select: { requiereReceta: true } },
            rentalRequest: { select: { status: true } },
            rentalDocument: true,
          },
        });
        this.assertRentalDocumentReplaceable(lockedItem);
        previous = lockedItem.rentalDocument;
        const now = new Date();

        return tx.rentalDocument.upsert({
          where: { rentalRequestItemId: itemId },
          create: {
            userId: currentUser.sub,
            rentalRequestItemId: itemId,
            ...this.assetData(uploaded),
            originalFilename: validated.originalFilename,
            mimeType: validated.mimeType,
            status: RentalDocumentStatus.PENDIENTE,
            uploadedAt: now,
            associatedAt: now,
            cleanupAfter: null,
          },
          update: {
            ...this.assetData(uploaded),
            originalFilename: validated.originalFilename,
            mimeType: validated.mimeType,
            status: RentalDocumentStatus.PENDIENTE,
            uploadedAt: now,
            associatedAt: now,
            cleanupAfter: null,
            reviewedAt: null,
            reviewedById: null,
            rejectionReason: null,
          },
        });
      })) as unknown as StoredRentalDocument;
    } catch (error) {
      await this.cloudinary.deleteAsset(uploaded).catch(() => undefined);
      throw error;
    }

    if (previous) {
      const previousAsset = this.toAsset(previous);
      try {
        await this.cloudinary.deleteAsset(previousAsset);
      } catch {
        this.logger.warn(
          'No se pudo eliminar de inmediato la receta rechazada reemplazada',
        );
        await this.appendPendingCleanup(saved.id, previousAsset);
      }
    }

    return {
      message: previous
        ? 'Receta reemplazada y enviada nuevamente a revision'
        : 'Receta adjuntada y enviada a revision',
      document: this.mapSummary(saved),
    };
  }

  async deleteForCartItem(currentUser: AuthUser, itemId: number) {
    const db = this.prisma.forUser(currentUser);
    const document = await db.$transaction(async (tx) => {
      await this.lockUserRentalFlow(tx, currentUser.sub);
      const located = await tx.rentalDocument.findFirst({
        where: {
          shoppingCartItemId: itemId,
          userId: currentUser.sub,
          shoppingCartItem: { cart: { userId: currentUser.sub } },
        },
      });
      if (!located) {
        throw new NotFoundException('Receta no encontrada');
      }

      await tx.rentalDocument.update({
        where: { id: located.id },
        data: { shoppingCartItemId: null, cleanupAfter: new Date() },
      });
      return located;
    });

    try {
      await this.deleteStoredDocumentAssets(document);
      await db.rentalDocument.delete({ where: { id: document.id } });
    } catch {
      this.logger.warn('La receta se marco para limpieza posterior');
    }

    return { message: 'Receta eliminada del producto' };
  }

  async getAuthorizedContent(
    currentUser: AuthUser,
    documentId: string,
    attachment: boolean,
  ) {
    const document = await this.prisma.rentalDocument.findUnique({
      where: { id: documentId },
      include: {
        shoppingCartItem: { select: { cart: { select: { userId: true } } } },
        rentalRequestItem: {
          select: { rentalRequest: { select: { userId: true } } },
        },
      },
    });
    if (!document) {
      throw new NotFoundException('Receta no encontrada');
    }

    const ownsDocument =
      document.userId === currentUser.sub &&
      (document.shoppingCartItem?.cart.userId === currentUser.sub ||
        document.rentalRequestItem?.rentalRequest.userId === currentUser.sub);
    if (currentUser.rol !== Rol.ADMIN && !ownsDocument) {
      throw new NotFoundException('Receta no encontrada');
    }

    return {
      fileName: document.originalFilename,
      mimeType: document.mimeType,
      data: await this.cloudinary.downloadAuthenticatedAsset(
        this.toAsset(document),
        attachment,
      ),
    };
  }

  async reviewForAdmin(
    currentUser: AuthUser,
    documentId: string,
    status: RentalDocumentStatus,
    rejectionReason?: string,
  ) {
    const normalizedReason = rejectionReason?.trim() || null;
    if (
      status === RentalDocumentStatus.RECHAZADO &&
      (!normalizedReason || normalizedReason.length < 3)
    ) {
      throw new BadRequestException(
        'Indica el motivo del rechazo de la receta',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const located = await tx.rentalDocument.findUnique({
        where: { id: documentId },
        select: {
          rentalRequestItem: {
            select: { rentalRequestId: true },
          },
        },
      });
      const rentalRequestId = located?.rentalRequestItem?.rentalRequestId;
      if (!rentalRequestId) {
        throw new NotFoundException(
          'Receta asociada a una solicitud no encontrada',
        );
      }

      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM management.rental_requests
        WHERE id = ${rentalRequestId}
        FOR UPDATE
      `;

      const document = await tx.rentalDocument.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          rentalRequestItem: {
            select: {
              rentalRequest: { select: { status: true } },
            },
          },
        },
      });
      if (
        !document ||
        document.rentalRequestItem?.rentalRequest.status !==
          RentalRequestStatus.PENDING
      ) {
        throw new BadRequestException(
          'Solo se pueden revisar recetas de solicitudes pendientes',
        );
      }

      return tx.rentalDocument.update({
        where: { id: documentId },
        data: {
          status,
          reviewedAt: new Date(),
          reviewedById: currentUser.sub,
          rejectionReason:
            status === RentalDocumentStatus.RECHAZADO ? normalizedReason : null,
        },
        include: {
          reviewedBy: {
            select: { id: true, nombre: true, correo: true },
          },
        },
      });
    });

    return {
      message:
        status === RentalDocumentStatus.APROBADO
          ? 'Receta aprobada'
          : 'Receta rechazada',
      document: {
        ...this.mapSummary(updated),
        reviewedBy: updated.reviewedBy,
      },
    };
  }

  async associateWithRentalItem(
    tx: Prisma.TransactionClient,
    userId: number,
    cartItemId: number,
    rentalRequestItemId: number,
    documentId: string,
  ) {
    const result = await tx.rentalDocument.updateMany({
      where: { id: documentId, userId, shoppingCartItemId: cartItemId },
      data: {
        shoppingCartItemId: null,
        rentalRequestItemId,
        associatedAt: new Date(),
        cleanupAfter: null,
      },
    });
    if (result.count !== 1) {
      throw new ConflictException(
        'La receta cambio mientras se enviaba la solicitud. Actualiza el carrito e intenta de nuevo',
      );
    }
  }

  async lockUserRentalFlow(tx: Prisma.TransactionClient, userId: number) {
    await tx.$queryRaw<Array<{ acquired: number }>>`
      SELECT 1::integer AS acquired
      FROM pg_advisory_xact_lock(
        CAST(73391 AS integer),
        CAST(${userId} AS integer)
      )
    `;
  }

  async cleanupDueDocuments() {
    const due = await this.prisma.rentalDocument.findMany({
      where: {
        associatedAt: null,
        rentalRequestItemId: null,
        cleanupAfter: { lte: new Date() },
      },
      take: 50,
    });

    for (const document of due) {
      try {
        await this.deleteStoredDocumentAssets(document);
        await this.prisma.rentalDocument.delete({ where: { id: document.id } });
      } catch {
        this.logger.warn(
          `No se pudo limpiar la receta temporal ${document.id}`,
        );
      }
    }

    const pending = await this.prisma.rentalDocument.findMany({
      where: { pendingAssetCleanup: { not: Prisma.DbNull } },
      take: 50,
    });
    for (const document of pending) {
      const assets = this.parsePendingCleanup(document.pendingAssetCleanup);
      const remaining: PendingAssetCleanup[] = [];
      for (const asset of assets) {
        try {
          await this.cloudinary.deleteAsset(asset);
        } catch {
          remaining.push(asset);
        }
      }
      await this.prisma.rentalDocument.update({
        where: { id: document.id },
        data: {
          pendingAssetCleanup:
            remaining.length > 0
              ? (remaining as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
        },
      });
    }
  }

  private validatePrescription(
    file: UploadedPrescriptionFile | undefined,
  ): ValidatedPrescriptionFile {
    if (!file || !file.buffer || file.buffer.length === 0 || file.size <= 0) {
      throw new BadRequestException('Selecciona una receta valida');
    }
    if (
      file.size > MAX_PRESCRIPTION_UPLOAD_BYTES ||
      file.buffer.length > MAX_PRESCRIPTION_UPLOAD_BYTES
    ) {
      throw new BadRequestException('La receta no debe superar 8 MB');
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const expectedMime = ALLOWED_EXTENSIONS.get(extension);
    if (!expectedMime || file.mimetype !== expectedMime) {
      throw new BadRequestException(
        'La extension y el tipo MIME de la receta no coinciden',
      );
    }
    const detectedMime = assertPrescriptionDocumentMagicBytes(file.buffer);
    if (detectedMime !== expectedMime) {
      throw new BadRequestException(
        'El contenido real de la receta no coincide con su tipo de archivo',
      );
    }

    return {
      buffer: file.buffer,
      originalFilename: sanitizeFileName(file.originalname, 'receta'),
      mimeType: detectedMime,
      format: extension === 'jpeg' ? 'jpg' : extension,
      resourceType:
        detectedMime === 'application/pdf'
          ? CloudinaryResourceType.RAW
          : CloudinaryResourceType.IMAGE,
      bytes: file.buffer.length,
    };
  }

  private assertRentalDocumentReplaceable(
    item: {
      id: number;
      rentalRequestId: string;
      product: { requiereReceta: boolean };
      rentalRequest: { status: RentalRequestStatus };
      rentalDocument: { status: RentalDocumentStatus } | null;
    } | null,
  ): asserts item is {
    id: number;
    rentalRequestId: string;
    product: { requiereReceta: boolean };
    rentalRequest: { status: RentalRequestStatus };
    rentalDocument: { status: RentalDocumentStatus } | null;
  } {
    if (!item) {
      throw new NotFoundException('Producto de renta no encontrado');
    }
    if (item.rentalRequest.status !== RentalRequestStatus.PENDING) {
      throw new BadRequestException(
        'Solo se pueden adjuntar recetas a solicitudes pendientes',
      );
    }
    if (!item.product.requiereReceta) {
      throw new BadRequestException('Este producto no requiere receta');
    }
    if (
      item.rentalDocument &&
      item.rentalDocument.status !== RentalDocumentStatus.RECHAZADO
    ) {
      throw new BadRequestException(
        'La receta solo puede reemplazarse cuando fue rechazada',
      );
    }
  }

  private assetData(asset: UploadedRentalAsset) {
    return {
      assetId: asset.assetId,
      publicId: asset.publicId,
      resourceType: asset.resourceType,
      deliveryType: asset.deliveryType,
      format: asset.format,
      bytes: asset.bytes,
    };
  }

  private toAsset(document: {
    assetId: string;
    publicId: string;
    resourceType: CloudinaryResourceType;
    deliveryType: CloudinaryDeliveryType;
    format: string;
    bytes: number;
  }): UploadedRentalAsset {
    return {
      assetId: document.assetId,
      publicId: document.publicId,
      resourceType: document.resourceType,
      deliveryType: document.deliveryType,
      format: document.format,
      bytes: document.bytes,
    };
  }

  private mapSummary(document: {
    id: string;
    originalFilename: string;
    mimeType: string;
    bytes: number;
    status: RentalDocumentStatus;
    uploadedAt: Date;
    associatedAt: Date | null;
    reviewedAt?: Date | null;
    rejectionReason?: string | null;
  }): RentalDocumentSummary {
    return {
      id: document.id,
      originalFilename: document.originalFilename,
      mimeType: document.mimeType,
      bytes: document.bytes,
      status: document.status,
      uploadedAt: document.uploadedAt.toISOString(),
      associatedAt: document.associatedAt?.toISOString() ?? null,
      reviewedAt: document.reviewedAt?.toISOString() ?? null,
      rejectionReason: document.rejectionReason ?? null,
    };
  }

  private async appendPendingCleanup(
    documentId: string,
    asset: PendingAssetCleanup,
  ) {
    const document = await this.prisma.rentalDocument.findUnique({
      where: { id: documentId },
      select: { pendingAssetCleanup: true },
    });
    const pending = this.parsePendingCleanup(document?.pendingAssetCleanup);
    pending.push(asset);
    await this.prisma.rentalDocument.update({
      where: { id: documentId },
      data: {
        pendingAssetCleanup: pending as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async deleteStoredDocumentAssets(document: {
    assetId: string;
    publicId: string;
    resourceType: CloudinaryResourceType;
    deliveryType: CloudinaryDeliveryType;
    format: string;
    bytes: number;
    pendingAssetCleanup?: Prisma.JsonValue | null;
  }) {
    await this.cloudinary.deleteAsset(this.toAsset(document));
    for (const pending of this.parsePendingCleanup(
      document.pendingAssetCleanup,
    )) {
      await this.cloudinary.deleteAsset(pending);
    }
  }

  private parsePendingCleanup(value: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(value)) return [] as PendingAssetCleanup[];
    return value.filter((item): item is PendingAssetCleanup => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return false;
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.assetId === 'string' &&
        typeof candidate.publicId === 'string' &&
        (candidate.resourceType === CloudinaryResourceType.IMAGE ||
          candidate.resourceType === CloudinaryResourceType.RAW) &&
        candidate.deliveryType === CloudinaryDeliveryType.AUTHENTICATED &&
        typeof candidate.format === 'string' &&
        typeof candidate.bytes === 'number'
      );
    });
  }

  private getTemporaryTtlHours() {
    const configured = Number(
      this.configService.get<string>('RENTAL_TEMP_DOCUMENT_TTL_HOURS') ?? 24,
    );
    return Number.isInteger(configured) && configured > 0 ? configured : 24;
  }
}
