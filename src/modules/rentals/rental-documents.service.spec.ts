import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  CloudinaryDeliveryType,
  CloudinaryResourceType,
  RentalDocumentStatus,
  Rol,
} from '@prisma/client';
import { RentalDocumentsService } from './rental-documents.service';

const clientUser = {
  sub: 10,
  id: 10,
  rol: Rol.CLIENT,
  correo: 'client@test.dev',
  sid: 'session',
};
const adminUser = {
  sub: 1,
  id: 1,
  rol: Rol.ADMIN,
  correo: 'admin@test.dev',
  sid: 'admin-session',
};

function uploadedAsset(overrides: Record<string, unknown> = {}) {
  return {
    assetId: 'asset-new',
    publicId: 'cemydi/recetas/temp/10/document.pdf',
    resourceType: CloudinaryResourceType.RAW,
    deliveryType: CloudinaryDeliveryType.AUTHENTICATED,
    format: 'pdf',
    bytes: 15,
    ...overrides,
  };
}

function storedDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'document-1',
    userId: 10,
    shoppingCartItemId: 1,
    rentalRequestItemId: null,
    originalFilename: 'receta.pdf',
    mimeType: 'application/pdf',
    status: RentalDocumentStatus.PENDIENTE,
    uploadedAt: new Date('2026-07-18T12:00:00.000Z'),
    associatedAt: null,
    cleanupAfter: new Date('2026-07-19T12:00:00.000Z'),
    reviewedAt: null,
    reviewedById: null,
    rejectionReason: null,
    updatedAt: new Date('2026-07-18T12:00:00.000Z'),
    pendingAssetCleanup: null,
    ...uploadedAsset(),
    ...overrides,
  };
}

function setup() {
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    $transaction: jest.fn(),
    shoppingCartItem: {
      findFirst: jest.fn().mockResolvedValue({
        id: 1,
        product: { requiereReceta: true },
        rentalDocument: null,
      }),
    },
    rentalDocument: {
      upsert: jest.fn().mockResolvedValue(storedDocument()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    rentalRequestItem: {
      findFirst: jest.fn(),
    },
  };
  db.$transaction.mockImplementation(
    (callback: (client: typeof db) => unknown) => callback(db),
  );
  const prisma = {
    forUser: jest.fn().mockReturnValue(db),
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'rental-1' }]),
    $transaction: jest.fn(),
    rentalDocument: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
      update: jest.fn(),
    },
  };
  prisma.$transaction.mockImplementation(
    (callback: (client: typeof prisma) => unknown) => callback(prisma),
  );
  const cloudinary = {
    uploadPrescription: jest.fn().mockResolvedValue(uploadedAsset()),
    deleteAsset: jest.fn().mockResolvedValue(undefined),
    downloadAuthenticatedAsset: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  };
  const rateLimit = { consume: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: jest.fn((key: string) =>
      key === 'RENTAL_TEMP_DOCUMENT_TTL_HOURS' ? '24' : undefined,
    ),
  };
  return {
    service: new RentalDocumentsService(
      prisma as never,
      config as never,
      cloudinary as never,
      rateLimit as never,
    ),
    prisma,
    db,
    cloudinary,
    rateLimit,
  };
}

function file(originalname: string, mimetype: string, buffer: Buffer) {
  return {
    fieldname: 'file',
    originalname,
    mimetype,
    size: buffer.length,
    buffer,
  };
}

describe('RentalDocumentsService', () => {
  it.each([
    [
      'receta.pdf',
      'application/pdf',
      Buffer.from('%PDF-1.4\nreceta'),
      CloudinaryResourceType.RAW,
    ],
    [
      'receta.jpg',
      'image/jpeg',
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      CloudinaryResourceType.IMAGE,
    ],
    [
      'receta.png',
      'image/png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      CloudinaryResourceType.IMAGE,
    ],
    [
      'receta.webp',
      'image/webp',
      Buffer.from('RIFF0000WEBP'),
      CloudinaryResourceType.IMAGE,
    ],
  ])(
    'validates and uploads %s as an authenticated asset',
    async (originalname, mimetype, buffer, resourceType) => {
      const { service, cloudinary, db, rateLimit } = setup();

      await service.uploadForCartItem(
        clientUser,
        1,
        file(originalname, mimetype, buffer),
      );

      expect(rateLimit.consume).toHaveBeenCalledWith(clientUser.sub);
      expect(cloudinary.uploadPrescription).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType, mimeType: mimetype }),
        clientUser.sub,
      );
      const expectedUpsert: unknown = expect.objectContaining({
        // Jest asymmetric matchers are typed as any by @types/jest.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        create: expect.objectContaining({
          deliveryType: CloudinaryDeliveryType.AUTHENTICATED,
        }),
      });
      expect(db.rentalDocument.upsert).toHaveBeenCalledWith(expectedUpsert);
      expect(db).not.toHaveProperty('product.update');
    },
  );

  it.each([
    ['empty file', file('receta.pdf', 'application/pdf', Buffer.alloc(0))],
    ['MIME mismatch', file('receta.pdf', 'image/png', Buffer.from('%PDF-1.4'))],
    [
      'magic bytes mismatch',
      file('receta.pdf', 'application/pdf', Buffer.from('not-pdf')),
    ],
    [
      'oversized file',
      file(
        'receta.pdf',
        'application/pdf',
        Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(8 * 1024 * 1024)]),
      ),
    ],
  ])('rejects %s before Cloudinary', async (_label, invalidFile) => {
    const { service, cloudinary } = setup();

    await expect(
      service.uploadForCartItem(clientUser, 1, invalidFile),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cloudinary.uploadPrescription).not.toHaveBeenCalled();
  });

  it('replaces the single active document and destroys the previous asset correctly', async () => {
    const { service, db, cloudinary } = setup();
    db.shoppingCartItem.findFirst.mockResolvedValue({
      id: 1,
      product: { requiereReceta: true },
      rentalDocument: storedDocument({
        assetId: 'asset-old',
        publicId: 'old-id',
        resourceType: CloudinaryResourceType.IMAGE,
        deliveryType: CloudinaryDeliveryType.AUTHENTICATED,
        format: 'jpg',
      }),
    });

    await service.uploadForCartItem(
      clientUser,
      1,
      file('receta.pdf', 'application/pdf', Buffer.from('%PDF-1.4')),
    );

    expect(db.rentalDocument.upsert).toHaveBeenCalledTimes(1);
    expect(cloudinary.deleteAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        publicId: 'old-id',
        resourceType: CloudinaryResourceType.IMAGE,
        deliveryType: CloudinaryDeliveryType.AUTHENTICATED,
      }),
    );
  });

  it('lets the owner replace a rejected prescription on a pending request', async () => {
    const { service, db, cloudinary } = setup();
    const rejected = storedDocument({
      shoppingCartItemId: null,
      rentalRequestItemId: 22,
      status: RentalDocumentStatus.RECHAZADO,
      rejectionReason: 'Documento ilegible',
    });
    db.rentalRequestItem.findFirst.mockResolvedValue({
      id: 22,
      rentalRequestId: 'rental-1',
      product: { requiereReceta: true },
      rentalRequest: { status: 'PENDING' },
      rentalDocument: rejected,
    });
    db.rentalDocument.upsert.mockResolvedValue(
      storedDocument({
        shoppingCartItemId: null,
        rentalRequestItemId: 22,
        associatedAt: new Date(),
      }),
    );

    const result = await service.uploadForRentalItem(
      clientUser,
      22,
      file('nueva.pdf', 'application/pdf', Buffer.from('%PDF-1.4')),
    );

    expect(result.document.status).toBe(RentalDocumentStatus.PENDIENTE);
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    expect(cloudinary.deleteAsset).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: rejected.assetId }),
    );
  });

  it('does not replace an approved prescription', async () => {
    const { service, db, cloudinary } = setup();
    db.rentalRequestItem.findFirst.mockResolvedValue({
      id: 22,
      rentalRequestId: 'rental-1',
      product: { requiereReceta: true },
      rentalRequest: { status: 'PENDING' },
      rentalDocument: storedDocument({
        status: RentalDocumentStatus.APROBADO,
      }),
    });

    await expect(
      service.uploadForRentalItem(
        clientUser,
        22,
        file('nueva.pdf', 'application/pdf', Buffer.from('%PDF-1.4')),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cloudinary.uploadPrescription).not.toHaveBeenCalled();
  });

  it('fails request creation when the expected cart document was not associated', async () => {
    const { service, db } = setup();
    db.rentalDocument.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.associateWithRentalItem(db as never, 10, 1, 22, 'document-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('streams an authenticated document only to its owner or an admin', async () => {
    const { service, prisma, cloudinary } = setup();
    prisma.rentalDocument.findUnique.mockResolvedValue({
      ...storedDocument(),
      shoppingCartItem: { cart: { userId: clientUser.sub } },
      rentalRequestItem: null,
    });

    const result = await service.getAuthorizedContent(
      clientUser,
      'document-1',
      false,
    );

    expect(result.data).toEqual(Buffer.from('pdf'));
    expect(cloudinary.downloadAuthenticatedAsset).toHaveBeenCalled();

    await expect(
      service.getAuthorizedContent(
        { ...clientUser, sub: 99, id: 99 },
        'document-1',
        false,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets an administrator approve an associated prescription', async () => {
    const { service, prisma } = setup();
    prisma.rentalDocument.findUnique
      .mockResolvedValueOnce({
        rentalRequestItem: { rentalRequestId: 'rental-1' },
      })
      .mockResolvedValueOnce({
        id: 'document-1',
        rentalRequestItem: {
          rentalRequest: { status: 'PENDING' },
        },
      });
    prisma.rentalDocument.update.mockResolvedValue(
      storedDocument({
        rentalRequestItemId: 1,
        status: RentalDocumentStatus.APROBADO,
        reviewedAt: new Date(),
        reviewedById: adminUser.sub,
        reviewedBy: {
          id: adminUser.sub,
          nombre: 'Admin',
          correo: adminUser.correo,
        },
      }),
    );

    const result = await service.reviewForAdmin(
      adminUser,
      'document-1',
      RentalDocumentStatus.APROBADO,
    );

    expect(result.document.status).toBe(RentalDocumentStatus.APROBADO);
    const expectedReviewData: unknown = expect.objectContaining({
      reviewedById: adminUser.sub,
      rejectionReason: null,
    });
    const expectedReviewUpdate: unknown = expect.objectContaining({
      data: expectedReviewData,
    });
    expect(prisma.rentalDocument.update).toHaveBeenCalledWith(
      expectedReviewUpdate,
    );
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('requires a reason to reject an associated prescription', async () => {
    const { service, prisma } = setup();
    prisma.rentalDocument.findUnique.mockResolvedValue({
      rentalRequestItem: { rentalRequestId: 'rental-1' },
    });

    await expect(
      service.reviewForAdmin(
        adminUser,
        'document-1',
        RentalDocumentStatus.RECHAZADO,
        ' ',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.rentalDocument.update).not.toHaveBeenCalled();
  });

  it('does not review a document after the request stopped being pending', async () => {
    const { service, prisma } = setup();
    prisma.rentalDocument.findUnique
      .mockResolvedValueOnce({
        rentalRequestItem: { rentalRequestId: 'rental-1' },
      })
      .mockResolvedValueOnce({
        id: 'document-1',
        rentalRequestItem: {
          rentalRequest: { status: 'APPROVED' },
        },
      });

    await expect(
      service.reviewForAdmin(
        adminUser,
        'document-1',
        RentalDocumentStatus.RECHAZADO,
        'Documento ilegible',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.rentalDocument.update).not.toHaveBeenCalled();
  });
});
