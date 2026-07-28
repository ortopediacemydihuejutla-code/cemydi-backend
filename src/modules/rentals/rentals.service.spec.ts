import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CartItemMode,
  RentalDepositStatus,
  RentalDocumentStatus,
  RentalDeliveryMethod,
  RentalRequestStatus,
  Rol,
  TipoAdquisicion,
} from '@prisma/client';
import { RentalsService } from './rentals.service';

const clientUser = {
  sub: 10,
  id: 10,
  rol: Rol.CLIENT,
  correo: 'c@test.dev',
  sid: 'client-session',
};
const adminUser = {
  sub: 1,
  id: 1,
  rol: Rol.ADMIN,
  correo: 'a@test.dev',
  sid: 'admin-session',
};

function rentalRequirements(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    applicantName: 'Cliente CEMYDI',
    applicantEmail: clientUser.correo,
    applicantPhone: '5551234567',
    isForAnotherPerson: false,
    deliveryMethod: RentalDeliveryMethod.PICKUP,
    acceptRentalTerms: true,
    acceptPrivacy: true,
    ...overrides,
  };
}

function futureDate(daysFromNow: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function rentalProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 20,
    nombre: 'Silla de ruedas',
    marca: 'Drive',
    modelo: 'RX',
    descripcion: 'Equipo de movilidad',
    precio: 1000,
    clasificacion: 'Movilidad',
    stock: 4,
    proveedor: 'CEMYDI',
    tipoAdquisicion: TipoAdquisicion.RENTA,
    requiereReceta: false,
    rentalDailyPrice: 120,
    rentalMinDays: 2,
    rentalDeposit: 300,
    rentalTerms: null,
    activo: true,
    images: [],
    promotionLinks: [],
    ...overrides,
  };
}

function rentalRequest(overrides: Partial<Record<string, unknown>> = {}) {
  const startDate = futureDate(2);
  const endDate = futureDate(4);
  return {
    id: 'rental_1',
    folio: 'REN-2026-000001',
    userId: clientUser.sub,
    status: RentalRequestStatus.PENDING,
    subtotal: 360,
    depositTotal: 300,
    depositStatus: RentalDepositStatus.PENDING,
    depositReturnedAmount: 0,
    depositRetainedAmount: 0,
    depositNotes: null,
    depositResolvedAt: null,
    depositResolvedById: null,
    total: 660,
    notes: null,
    applicantName: 'Cliente CEMYDI',
    applicantEmail: clientUser.correo,
    applicantPhone: '5551234567',
    isForAnotherPerson: false,
    patientName: null,
    patientRelationship: null,
    deliveryMethod: RentalDeliveryMethod.PICKUP,
    deliveryAddress: null,
    deliveryNeighborhood: null,
    deliveryPostalCode: null,
    deliveryMunicipality: null,
    deliveryReferences: null,
    preferredSchedule: null,
    rentalTermsAcceptedAt: new Date(),
    privacyAcceptedAt: new Date(),
    rejectedReason: null,
    approvedById: null,
    approvedAt: null,
    rejectedAt: null,
    cancelledAt: null,
    deliveredAt: null,
    returnedAt: null,
    statusUpdatedById: clientUser.sub,
    statusUpdatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: clientUser.sub,
      nombre: 'Cliente',
      correo: clientUser.correo,
      telefono: null,
      direccion: null,
    },
    approvedBy: null,
    statusUpdatedBy: {
      id: clientUser.sub,
      nombre: 'Cliente',
      correo: clientUser.correo,
    },
    depositResolvedBy: null,
    statusHistory: [],
    items: [
      {
        id: 1,
        rentalRequestId: 'rental_1',
        productId: 20,
        quantity: 1,
        startDate,
        endDate,
        days: 3,
        dailyPrice: 120,
        deposit: 300,
        lineSubtotal: 360,
        lineDeposit: 300,
        lineTotal: 660,
        notes: null,
        productNameSnapshot: 'Silla de ruedas',
        productModelSnapshot: 'RX',
        createdAt: new Date(),
        rentalDocument: null,
        product: rentalProduct(),
      },
    ],
    ...overrides,
  };
}

function createService(txOverrides: Record<string, unknown> = {}) {
  const tx = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ value: 1n }]),
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: clientUser.sub, activo: true }),
    },
    shoppingCart: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    shoppingCartItem: {
      deleteMany: jest.fn(),
    },
    rentalRequest: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    rentalRequestItem: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    rentalStatusHistory: {
      create: jest.fn(),
    },
    product: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    ...txOverrides,
  };

  const prisma = {
    forUser: jest.fn().mockReturnValue({
      ...tx,
      $transaction: jest.fn((input: unknown) =>
        Array.isArray(input)
          ? Promise.all(input)
          : (input as (client: typeof tx) => unknown)(tx),
      ),
    }),
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  const rentalDocuments = {
    associateWithRentalItem: jest.fn(),
    getAuthorizedContent: jest.fn(),
  };

  return {
    service: new RentalsService(prisma as never, rentalDocuments as never),
    prisma,
    tx,
    rentalDocuments,
  };
}

describe('RentalsService', () => {
  it('paginates my rentals and returns user-scoped aggregate counts', async () => {
    const { service, tx } = createService();
    tx.rentalRequest.findMany.mockResolvedValue([rentalRequest()]);
    tx.rentalRequest.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const result = await service.listMine(clientUser, {
      status: undefined,
      search: 'silla',
      page: 1,
      pageSize: 8,
    });

    expect(result.rentals).toHaveLength(1);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 8,
      total: 1,
      totalPages: 1,
    });
    expect(result.counts).toEqual(
      expect.objectContaining({ all: 1, pending: 1 }),
    );
    expect(tx.rentalRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 8 }),
    );
  });

  it('creates a rental request from rental cart items and ignores frontend pricing', async () => {
    const { service, tx } = createService();
    const startDate = futureDate(2);
    const endDate = futureDate(3);
    const created = rentalRequest();

    tx.shoppingCart.findUnique.mockResolvedValue({
      id: 'cart_1',
      items: [
        {
          id: 1,
          cartId: 'cart_1',
          productId: 20,
          quantity: 2,
          mode: CartItemMode.RENTA,
          rentalStartDate: startDate,
          rentalEndDate: endDate,
          rentalNotes: 'Entrega por la tarde',
          product: rentalProduct(),
        },
      ],
    });
    tx.rentalRequest.create.mockResolvedValue({ id: created.id });
    tx.rentalRequestItem.create.mockResolvedValue({ id: 1 });
    tx.rentalRequest.findUniqueOrThrow.mockResolvedValue(created);

    const result = await service.createFromCart(
      clientUser,
      rentalRequirements(),
    );

    // Prisma serializes interpolated integer values as bigint in raw queries.
    // Both advisory-lock arguments must be explicitly cast to the same overload.
    const rawQueryCalls: unknown = tx.$queryRaw.mock.calls;
    const [lockCall] = rawQueryCalls as Array<
      [TemplateStringsArray, ...unknown[]]
    >;
    const lockQuery = lockCall?.[0].join('') ?? '';
    expect(lockQuery).toContain('SELECT 1::integer AS acquired');
    expect(lockQuery).toContain('FROM pg_advisory_xact_lock');
    expect(lockQuery).toContain('CAST(73391 AS integer)');
    expect(lockQuery).toContain('CAST(');
    expect(lockQuery).toContain('AS integer)');

    const expectedRequestData: unknown = expect.objectContaining({
      subtotal: 480,
      depositTotal: 600,
      total: 1080,
      folio: 'REN-2026-000001',
      applicantName: 'Cliente CEMYDI',
      applicantEmail: clientUser.correo,
      applicantPhone: '5551234567',
      deliveryMethod: RentalDeliveryMethod.PICKUP,
    });
    const expectedRequestCreate: unknown = expect.objectContaining({
      data: expectedRequestData,
    });
    expect(tx.rentalRequest.create).toHaveBeenCalledWith(expectedRequestCreate);
    const expectedItemData: unknown = expect.objectContaining({
      productNameSnapshot: 'Silla de ruedas',
      productModelSnapshot: 'RX',
    });
    const expectedItemCreate: unknown = expect.objectContaining({
      data: expectedItemData,
    });
    expect(tx.rentalRequestItem.create).toHaveBeenCalledWith(
      expectedItemCreate,
    );
    const expectedInitialHistoryData: unknown = expect.objectContaining({
      rentalRequestId: created.id,
      fromStatus: null,
      toStatus: RentalRequestStatus.PENDING,
    });
    const expectedInitialHistory: unknown = {
      data: expectedInitialHistoryData,
    };
    expect(tx.rentalStatusHistory.create).toHaveBeenCalledWith(
      expectedInitialHistory,
    );
    expect(tx.shoppingCartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart_1', mode: CartItemMode.RENTA },
    });
    expect(result.rental.id).toBe(created.id);
  });

  it('persists the active promotion in the authoritative rental price', async () => {
    const { service, tx } = createService();
    const startDate = futureDate(2);
    const endDate = futureDate(3);
    const created = rentalRequest();

    tx.shoppingCart.findUnique.mockResolvedValue({
      id: 'cart_1',
      items: [
        {
          id: 1,
          cartId: 'cart_1',
          productId: 20,
          quantity: 2,
          mode: CartItemMode.RENTA,
          rentalStartDate: startDate,
          rentalEndDate: endDate,
          rentalNotes: null,
          rentalDocument: null,
          product: rentalProduct({
            promotionLinks: [
              {
                promotion: {
                  id: 8,
                  descripcion: 'Renta especial',
                  discountPercent: 20,
                  startAt: new Date('2020-01-01T00:00:00.000Z'),
                  endAt: new Date('2099-12-31T00:00:00.000Z'),
                },
              },
            ],
          }),
        },
      ],
    });
    tx.rentalRequest.create.mockResolvedValue({ id: created.id });
    tx.rentalRequestItem.create.mockResolvedValue({ id: 1 });
    tx.rentalRequest.findUniqueOrThrow.mockResolvedValue(created);

    await service.createFromCart(clientUser, rentalRequirements());

    expect(tx.rentalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: 384,
          depositTotal: 600,
          total: 984,
        }),
      }),
    );
    expect(tx.rentalRequestItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dailyPrice: 96,
          lineSubtotal: 384,
          lineTotal: 984,
        }),
      }),
    );
  });

  it('requires a prescription document when any rental product requires one', async () => {
    const { service, tx } = createService();
    tx.shoppingCart.findUnique.mockResolvedValue({
      id: 'cart_1',
      items: [
        {
          id: 1,
          productId: 20,
          quantity: 1,
          rentalStartDate: futureDate(2),
          rentalEndDate: futureDate(3),
          rentalNotes: null,
          product: rentalProduct({ requiereReceta: true }),
        },
      ],
    });

    await expect(
      service.createFromCart(clientUser, rentalRequirements()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('associates the existing cart document without writing legacy binary fields', async () => {
    const { service, tx, rentalDocuments } = createService();
    const created = rentalRequest();

    tx.shoppingCart.findUnique.mockResolvedValue({
      id: 'cart_1',
      items: [
        {
          id: 1,
          cartId: 'cart_1',
          productId: 20,
          quantity: 1,
          rentalStartDate: futureDate(2),
          rentalEndDate: futureDate(3),
          rentalNotes: null,
          rentalDocument: { id: 'document-1' },
          product: rentalProduct({ requiereReceta: true }),
        },
      ],
    });
    tx.rentalRequest.create.mockResolvedValue({ id: created.id });
    tx.rentalRequestItem.create.mockResolvedValue({ id: 1 });
    tx.rentalRequest.findUniqueOrThrow.mockResolvedValue(created);

    await service.createFromCart(clientUser, rentalRequirements());

    // Jest mock call storage is typed as any by @types/jest.
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    const requestItemCreate = tx.rentalRequestItem.create.mock
      .calls[0]?.[0] as unknown as { data: Record<string, unknown> };
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
    expect(requestItemCreate.data).not.toHaveProperty('prescriptionFileName');
    expect(requestItemCreate.data).not.toHaveProperty('prescriptionMimeType');
    expect(requestItemCreate.data).not.toHaveProperty('prescriptionSizeBytes');
    expect(requestItemCreate.data).not.toHaveProperty('prescriptionData');
    expect(rentalDocuments.associateWithRentalItem).toHaveBeenCalledWith(
      tx,
      clientUser.sub,
      1,
      1,
      'document-1',
    );
  });

  it('downloads an associated Cloudinary document for the rental owner', async () => {
    const { service, tx, rentalDocuments } = createService();
    const content = {
      fileName: 'receta.pdf',
      mimeType: 'application/pdf',
      data: Buffer.from('%PDF-1.4\nreceta'),
    };
    tx.rentalRequestItem.findFirst.mockResolvedValue({
      rentalDocument: { id: 'document-1' },
    });
    rentalDocuments.getAuthorizedContent.mockResolvedValue(content);

    const result = await service.getPrescriptionDocument(clientUser, 1);

    const expectedWhere: unknown = expect.objectContaining({
      id: 1,
      rentalRequest: { userId: clientUser.sub },
    });
    expect(tx.rentalRequestItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
      }),
    );
    expect(rentalDocuments.getAuthorizedContent).toHaveBeenCalledWith(
      clientUser,
      'document-1',
      false,
    );
    expect(result.fileName).toBe('receta.pdf');
    expect(result.data).toEqual(content.data);
  });

  it('returns one rental only when it belongs to the authenticated client', async () => {
    const { service, tx } = createService();
    const existing = rentalRequest();
    tx.rentalRequest.findFirst.mockResolvedValue(existing);

    const result = await service.getMine(clientUser, existing.id);

    expect(tx.rentalRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id, userId: clientUser.sub },
      }),
    );
    expect(result.rental.id).toBe(existing.id);
    expect(result.rental.folio).toBe(existing.folio);
  });

  it('does not expose another client rental in the detail endpoint', async () => {
    const { service, tx } = createService();
    tx.rentalRequest.findFirst.mockResolvedValue(null);

    await expect(service.getMine(clientUser, 'other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a sale-only product in a rental cart item', async () => {
    const { service, tx } = createService();
    tx.shoppingCart.findUnique.mockResolvedValue({
      id: 'cart_1',
      items: [
        {
          id: 1,
          productId: 20,
          quantity: 1,
          rentalStartDate: futureDate(2),
          rentalEndDate: futureDate(3),
          rentalNotes: null,
          product: rentalProduct({ tipoAdquisicion: TipoAdquisicion.VENTA }),
        },
      ],
    });

    await expect(
      service.createFromCart(clientUser, rentalRequirements()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a rentable product without daily price', async () => {
    const { service, tx } = createService();
    tx.shoppingCart.findUnique.mockResolvedValue({
      id: 'cart_1',
      items: [
        {
          id: 1,
          productId: 20,
          quantity: 1,
          rentalStartDate: futureDate(2),
          rentalEndDate: futureDate(3),
          rentalNotes: null,
          product: rentalProduct({ rentalDailyPrice: null }),
        },
      ],
    });

    await expect(
      service.createFromCart(clientUser, rentalRequirements()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects rentals with past start dates', async () => {
    const { service, tx } = createService();
    tx.shoppingCart.findUnique.mockResolvedValue({
      id: 'cart_1',
      items: [
        {
          id: 1,
          productId: 20,
          quantity: 1,
          rentalStartDate: futureDate(-2),
          rentalEndDate: futureDate(1),
          rentalNotes: null,
          product: rentalProduct(),
        },
      ],
    });

    await expect(
      service.createFromCart(clientUser, rentalRequirements()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approves with guarded stock decrement', async () => {
    const { service, tx } = createService();
    const existing = rentalRequest();
    tx.rentalRequest.findUnique.mockResolvedValue(existing);
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.rentalRequest.update.mockResolvedValue({
      ...existing,
      status: RentalRequestStatus.APPROVED,
      approvedById: adminUser.sub,
      approvedAt: new Date(),
      statusUpdatedById: adminUser.sub,
    });

    await service.approve(adminUser, existing.id);

    const expectedStockGuard: unknown = expect.objectContaining({
      id: 20,
      stock: { gte: 1 },
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedStockGuard,
        data: { stock: { decrement: 1 } },
      }),
    );
  });

  it('aborts approval when stock is insufficient', async () => {
    const { service, tx } = createService();
    const existing = rentalRequest();
    tx.rentalRequest.findUnique.mockResolvedValue(existing);
    tx.product.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.approve(adminUser, existing.id),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.rentalRequest.update).not.toHaveBeenCalled();
  });

  it('requires approval of every mandatory prescription before reserving stock', async () => {
    const { service, tx } = createService();
    const existing = rentalRequest({
      items: [
        {
          ...rentalRequest().items[0],
          product: rentalProduct({ requiereReceta: true }),
          rentalDocument: {
            status: RentalDocumentStatus.PENDIENTE,
          },
        },
      ],
    });
    tx.rentalRequest.findUnique.mockResolvedValue(existing);

    await expect(
      service.approve(adminUser, existing.id),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('returns a delivered rental and reintegrates stock once', async () => {
    const { service, tx } = createService();
    const existing = rentalRequest({ status: RentalRequestStatus.DELIVERED });
    tx.rentalRequest.findUnique.mockResolvedValue(existing);
    tx.rentalRequest.update.mockResolvedValue({
      ...existing,
      status: RentalRequestStatus.RETURNED,
      returnedAt: new Date(),
    });

    await service.returnRental(adminUser, existing.id);

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { stock: { increment: 1 } },
    });
  });

  it('does not let a client cancel another user rental', async () => {
    const { service, tx } = createService();
    tx.rentalRequest.findFirst.mockResolvedValue(null);

    await expect(
      service.cancelMine(clientUser, 'other'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets the owner cancel a pending request without changing stock', async () => {
    const { service, tx } = createService();
    const existing = rentalRequest();
    tx.rentalRequest.findFirst.mockResolvedValue(existing);
    tx.rentalRequest.update.mockResolvedValue({
      ...existing,
      status: RentalRequestStatus.CANCELLED,
      cancelledAt: new Date(),
    });

    const result = await service.cancelMine(clientUser, existing.id);

    expect(result.rental.status).toBe(RentalRequestStatus.CANCELLED);
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('cancels an approved request and restores reserved stock once', async () => {
    const { service, tx } = createService();
    const approved = rentalRequest({ status: RentalRequestStatus.APPROVED });
    tx.rentalRequest.findUnique.mockResolvedValue(approved);
    tx.rentalRequest.update.mockResolvedValue({
      ...approved,
      status: RentalRequestStatus.CANCELLED,
      cancelledAt: new Date(),
    });

    await service.cancelApproved(adminUser, approved.id);

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { stock: { increment: 1 } },
    });
    const expectedCancellationHistoryData: unknown = expect.objectContaining({
      fromStatus: RentalRequestStatus.APPROVED,
      toStatus: RentalRequestStatus.CANCELLED,
    });
    const expectedCancellationHistory: unknown = {
      data: expectedCancellationHistoryData,
    };
    expect(tx.rentalStatusHistory.create).toHaveBeenCalledWith(
      expectedCancellationHistory,
    );
  });

  it('does not restore stock again when an approved cancellation is repeated', async () => {
    const { service, tx } = createService();
    tx.rentalRequest.findUnique.mockResolvedValue(
      rentalRequest({ status: RentalRequestStatus.CANCELLED }),
    );

    await expect(
      service.cancelApproved(adminUser, 'rental_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('resolves the returned deposit without changing inventory', async () => {
    const { service, tx } = createService();
    const returned = rentalRequest({ status: RentalRequestStatus.RETURNED });
    tx.rentalRequest.findUnique.mockResolvedValue(returned);
    tx.rentalRequest.update.mockResolvedValue({
      ...returned,
      depositStatus: RentalDepositStatus.PARTIALLY_RETAINED,
      depositReturnedAmount: 200,
      depositRetainedAmount: 100,
      depositResolvedAt: new Date(),
      depositResolvedBy: {
        id: adminUser.sub,
        nombre: 'Admin',
        correo: adminUser.correo,
      },
    });

    const result = await service.updateDeposit(adminUser, returned.id, {
      status: RentalDepositStatus.PARTIALLY_RETAINED,
      returnedAmount: 200,
      retainedAmount: 100,
      notes: 'Ajuste por desgaste',
    });

    expect(result.rental.depositRetainedAmount).toBe(100);
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a deposit breakdown that does not equal the original deposit', async () => {
    const { service, tx } = createService();
    tx.rentalRequest.findUnique.mockResolvedValue(
      rentalRequest({ status: RentalRequestStatus.RETURNED }),
    );

    await expect(
      service.updateDeposit(adminUser, 'rental_1', {
        status: RentalDepositStatus.PARTIALLY_RETAINED,
        returnedAmount: 50,
        retainedAmount: 50,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.rentalRequest.update).not.toHaveBeenCalled();
  });
});
