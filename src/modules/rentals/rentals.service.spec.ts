import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CartItemMode,
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
    ...overrides,
  };
}

function rentalRequest(overrides: Partial<Record<string, unknown>> = {}) {
  const startDate = futureDate(2);
  const endDate = futureDate(4);
  return {
    id: 'rental_1',
    userId: clientUser.sub,
    status: RentalRequestStatus.PENDING,
    subtotal: 360,
    depositTotal: 300,
    total: 660,
    notes: null,
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
        prescriptionFileName: null,
        prescriptionMimeType: null,
        prescriptionSizeBytes: null,
        prescriptionData: null,
        createdAt: new Date(),
        product: rentalProduct(),
      },
    ],
    ...overrides,
  };
}

function createService(txOverrides: Record<string, unknown> = {}) {
  const tx = {
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
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    rentalRequestItem: {
      findFirst: jest.fn(),
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
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    }),
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  return {
    service: new RentalsService(prisma as never),
    prisma,
    tx,
  };
}

describe('RentalsService', () => {
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
    tx.rentalRequest.create.mockResolvedValue(created);

    const result = await service.createFromCart(clientUser);

    const expectedRentalTotals: unknown = expect.objectContaining({
      subtotal: 480,
      depositTotal: 600,
      total: 1080,
    });
    expect(tx.rentalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expectedRentalTotals,
      }),
    );
    expect(tx.shoppingCartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart_1', mode: CartItemMode.RENTA },
    });
    expect(result.rental.id).toBe(created.id);
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

    await expect(service.createFromCart(clientUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('stores prescription metadata on the matching rental item', async () => {
    const { service, tx } = createService();
    const pdfBuffer = Buffer.from('%PDF-1.4\nreceta');
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
          product: rentalProduct({ requiereReceta: true }),
        },
      ],
    });
    tx.rentalRequest.create.mockResolvedValue(created);

    await service.createFromCart(clientUser, [
      {
        fieldname: 'prescription:1',
        originalname: 'receta.pdf',
        mimetype: 'application/pdf',
        size: pdfBuffer.length,
        buffer: pdfBuffer,
      },
    ]);

    const expectedItemsData: unknown = expect.objectContaining({
      create: [
        expect.objectContaining({
          prescriptionFileName: 'receta.pdf',
          prescriptionMimeType: 'application/pdf',
          prescriptionSizeBytes: pdfBuffer.length,
          prescriptionData: pdfBuffer,
        }),
      ],
    });
    const expectedPrescriptionData: unknown = expect.objectContaining({
      items: expectedItemsData,
    });
    expect(tx.rentalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expectedPrescriptionData,
      }),
    );
  });

  it('rejects a prescription field for an item outside the rental cart', async () => {
    const { service, tx } = createService();
    const pdfBuffer = Buffer.from('%PDF-1.4\nreceta');
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
      service.createFromCart(clientUser, [
        {
          fieldname: 'prescription:999',
          originalname: 'receta.pdf',
          mimetype: 'application/pdf',
          size: pdfBuffer.length,
          buffer: pdfBuffer,
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a prescription document larger than 8 MB', async () => {
    const { service, tx } = createService();
    const oversizedPdf = Buffer.alloc(8 * 1024 * 1024 + 1, 0);
    oversizedPdf.write('%PDF-1.4');
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
      service.createFromCart(clientUser, [
        {
          fieldname: 'prescription:1',
          originalname: 'receta.pdf',
          mimetype: 'application/pdf',
          size: oversizedPdf.length,
          buffer: oversizedPdf,
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('downloads an item prescription for the rental owner', async () => {
    const { service, tx } = createService();
    const pdfBuffer = Buffer.from('%PDF-1.4\nreceta');
    tx.rentalRequestItem.findFirst.mockResolvedValue({
      prescriptionFileName: 'receta.pdf',
      prescriptionMimeType: 'application/pdf',
      prescriptionData: pdfBuffer,
    });

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
    expect(result.fileName).toBe('receta.pdf');
    expect(result.data).toEqual(pdfBuffer);
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

    await expect(service.createFromCart(clientUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
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

    await expect(service.createFromCart(clientUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
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
          rentalStartDate: futureDate(-1),
          rentalEndDate: futureDate(1),
          rentalNotes: null,
          product: rentalProduct(),
        },
      ],
    });

    await expect(service.createFromCart(clientUser)).rejects.toBeInstanceOf(
      BadRequestException,
    );
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
});
