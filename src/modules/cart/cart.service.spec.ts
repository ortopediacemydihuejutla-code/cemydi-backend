import { CartItemMode, Rol, TipoAdquisicion } from '@prisma/client';
import { CartService } from './cart.service';

const clientUser = {
  sub: 10,
  id: 10,
  rol: Rol.CLIENT,
  correo: 'client@test.dev',
  sid: 'session',
};

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 20,
    nombre: 'Silla de ruedas',
    marca: 'Drive',
    modelo: 'RX',
    descripcion: 'Equipo de movilidad',
    precio: 1000,
    clasificacion: 'Movilidad',
    stock: 5,
    proveedor: 'CEMYDI',
    tipoAdquisicion: TipoAdquisicion.MIXTO,
    requiereReceta: true,
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

function cartItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    cartId: 'cart-1',
    productId: 20,
    quantity: 1,
    mode: CartItemMode.RENTA,
    rentalStartDate: null,
    rentalEndDate: null,
    rentalNotes: null,
    createdAt: new Date('2026-07-18T12:00:00.000Z'),
    updatedAt: new Date('2026-07-18T12:00:00.000Z'),
    rentalDocument: null,
    product: product(),
    ...overrides,
  };
}

function cart(items: ReturnType<typeof cartItem>[]) {
  return {
    id: 'cart-1',
    userId: clientUser.sub,
    createdAt: new Date('2026-07-18T12:00:00.000Z'),
    updatedAt: new Date('2026-07-18T12:00:00.000Z'),
    items,
  };
}

function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    user: { findUnique: jest.fn().mockResolvedValue({ id: 10, activo: true }) },
    product: { findUnique: jest.fn().mockResolvedValue(product()) },
    shoppingCart: {
      upsert: jest.fn().mockResolvedValue({ id: 'cart-1' }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    shoppingCartItem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    rentalDocument: { updateMany: jest.fn() },
  };
  const scoped = {
    ...tx,
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const prisma = { forUser: jest.fn().mockReturnValue(scoped) };
  return { service: new CartService(prisma as never), tx };
}

describe('CartService rental phase 1', () => {
  it('adds a rental without dates and exposes pending nullable totals', async () => {
    const { service, tx } = setup();
    tx.shoppingCartItem.findFirst.mockResolvedValue(null);
    tx.shoppingCart.findUnique.mockResolvedValue(cart([cartItem()]));

    const result = await service.addItem(clientUser, {
      productId: 20,
      quantity: 1,
      mode: CartItemMode.RENTA,
    });

    expect(tx.shoppingCartItem.create).toHaveBeenCalledWith({
      data: {
        cartId: 'cart-1',
        productId: 20,
        quantity: 1,
        mode: CartItemMode.RENTA,
        rentalStartDate: null,
        rentalEndDate: null,
        rentalNotes: null,
      },
    });
    expect(result.cart.items[0]).toEqual(
      expect.objectContaining({
        configurationStatus: 'PENDING',
        rentalDays: null,
        lineTotal: null,
      }),
    );
    expect(result.cart.summary).toEqual(
      expect.objectContaining({
        saleSubtotal: 0,
        rentalSubtotal: 0,
        rentalDepositTotal: 0,
        hasUnconfiguredRentalItems: true,
      }),
    );
    expect((tx as Record<string, unknown>).product).not.toHaveProperty(
      'update',
    );
  });

  it('configures inclusive rental dates without changing stock', async () => {
    const { service, tx } = setup();
    tx.shoppingCartItem.findFirst.mockResolvedValue({
      id: 1,
      cartId: 'cart-1',
      productId: 20,
      mode: CartItemMode.RENTA,
      rentalStartDate: null,
      rentalEndDate: null,
      rentalNotes: null,
    });
    tx.shoppingCart.findUnique.mockResolvedValue(
      cart([
        cartItem({
          rentalStartDate: new Date('2099-07-20T00:00:00.000Z'),
          rentalEndDate: new Date('2099-07-22T00:00:00.000Z'),
        }),
      ]),
    );

    const result = await service.updateItem(clientUser, 1, {
      quantity: 1,
      rentalStartDate: '2099-07-20',
      rentalEndDate: '2099-07-22',
    });

    expect(result.cart.items[0]).toEqual(
      expect.objectContaining({
        configurationStatus: 'COMPLETE',
        rentalDays: 3,
        lineTotal: 660,
      }),
    );
    expect(tx.shoppingCartItem.update).toHaveBeenCalled();
    expect((tx as Record<string, unknown>).product).not.toHaveProperty(
      'update',
    );
  });

  it('keeps sale totals intact while an unconfigured rental is pending', async () => {
    const { service, tx } = setup();
    tx.shoppingCart.findUnique.mockResolvedValue(
      cart([
        cartItem({
          id: 2,
          mode: CartItemMode.VENTA,
          quantity: 2,
          product: product({ requiereReceta: false }),
        }),
        cartItem(),
      ]),
    );

    const result = await service.getCart(clientUser);

    expect(result.cart.summary.saleSubtotal).toBe(2000);
    expect(result.cart.summary.total).toBe(2000);
    expect(
      result.cart.items.find((item) => item.id === 1)?.lineTotal,
    ).toBeNull();
  });

  it('applies the best active promotion to sale totals', async () => {
    const { service, tx } = setup();
    tx.shoppingCart.findUnique.mockResolvedValue(
      cart([
        cartItem({
          mode: CartItemMode.VENTA,
          quantity: 2,
          product: product({
            requiereReceta: false,
            promotionLinks: [
              {
                promotion: {
                  id: 7,
                  descripcion: 'Oferta de temporada',
                  discountPercent: 20,
                  startAt: new Date('2020-01-01T00:00:00.000Z'),
                  endAt: new Date('2099-01-01T00:00:00.000Z'),
                },
              },
            ],
          }),
        }),
      ]),
    );

    const result = await service.getCart(clientUser);

    expect(result.cart.items[0]).toEqual(
      expect.objectContaining({
        originalLineTotal: 2000,
        discountAmount: 400,
        finalLineTotal: 1600,
        lineTotal: 1600,
      }),
    );
    expect(result.cart.items[0]?.promotion).toMatchObject({
      id: 7,
      percent: 20,
    });
    expect(result.cart.summary).toEqual(
      expect.objectContaining({
        subtotal: 2000,
        discountTotal: 400,
        total: 1600,
      }),
    );
  });

  it('applies active promotions to the rental daily rate and totals', async () => {
    const { service, tx } = setup();
    tx.shoppingCart.findUnique.mockResolvedValue(
      cart([
        cartItem({
          rentalStartDate: new Date('2099-07-20T00:00:00.000Z'),
          rentalEndDate: new Date('2099-07-22T00:00:00.000Z'),
          product: product({
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
        }),
      ]),
    );

    const result = await service.getCart(clientUser);

    expect(result.cart.items[0]).toEqual(
      expect.objectContaining({
        originalLineTotal: 660,
        discountAmount: 72,
        finalLineTotal: 588,
        lineTotal: 588,
      }),
    );
    expect(result.cart.items[0]?.promotion).toMatchObject({
      id: 8,
      percent: 20,
    });
    expect(result.cart.items[0]?.rentalSummary).toEqual(
      expect.objectContaining({
        dailyPrice: 96,
        originalDailyPrice: 120,
        originalSubtotal: 360,
        subtotal: 288,
        discountAmount: 72,
        total: 588,
      }),
    );
    expect(result.cart.summary).toEqual(
      expect.objectContaining({
        subtotal: 360,
        rentalSubtotal: 360,
        promotionDiscountTotal: 72,
        discountTotal: 72,
        total: 588,
      }),
    );
  });

  it('clears only rental items and preserves sale items', async () => {
    const { service, tx } = setup();
    const saleItem = cartItem({
      id: 2,
      mode: CartItemMode.VENTA,
      product: product({ requiereReceta: false }),
    });
    tx.shoppingCart.findUnique
      .mockResolvedValueOnce({ id: 'cart-1' })
      .mockResolvedValueOnce(cart([saleItem]));

    const result = await service.clearRentals(clientUser);

    expect(tx.shoppingCartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart-1', mode: CartItemMode.RENTA },
    });
    expect(tx.rentalDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shoppingCartItem: {
            cartId: 'cart-1',
            mode: CartItemMode.RENTA,
          },
        },
      }),
    );
    expect(result.cart.items).toHaveLength(1);
    expect(result.cart.items[0].mode).toBe(CartItemMode.VENTA);
  });
});
