import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminNotificationsService } from './admin-notifications.service';

describe('AdminNotificationsService', () => {
  const prisma = {
    rentalRequest: { findMany: jest.fn() },
    review: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
  };

  let service: AdminNotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminNotificationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(AdminNotificationsService);
  });

  it('combina rentas, reseñas e inventario pendientes en un solo feed', async () => {
    prisma.rentalRequest.findMany.mockResolvedValue([
      {
        id: 'rental-1',
        folio: 'REN-2026-000001',
        createdAt: new Date('2026-07-20T10:00:00.000Z'),
        user: { nombre: 'Ana', correo: 'ana@example.com' },
      },
    ]);
    prisma.review.findMany.mockResolvedValue([
      {
        id: 8,
        rating: 5,
        createdAt: new Date('2026-07-20T09:00:00.000Z'),
        product: { nombre: 'Silla de ruedas' },
        user: { nombre: 'Luis', correo: 'luis@example.com' },
      },
    ]);
    prisma.product.findMany.mockResolvedValue([
      { id: 4, nombre: 'Concentrador', stock: 1 },
      { id: 5, nombre: 'Tanque de oxígeno', stock: 0 },
    ]);

    const result = await service.listCurrent(40);

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'rental:rental-1',
          category: 'rental',
          href: '/admin/rentals',
        }),
        expect.objectContaining({
          id: 'review:8',
          category: 'review',
          href: '/admin/reviews',
        }),
        expect.objectContaining({
          id: 'inventory:4',
          category: 'inventory',
          description: 'Concentrador · queda 1 unidad.',
        }),
        expect.objectContaining({
          id: 'inventory:5',
          title: 'Producto agotado',
        }),
      ]),
    );
    expect(result.checkedAt).toEqual(expect.any(String));
  });

  it('consulta únicamente registros que requieren atención', async () => {
    prisma.rentalRequest.findMany.mockResolvedValue([]);
    prisma.review.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);

    await service.listCurrent();

    expect(prisma.rentalRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' } }),
    );
    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' } }),
    );
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activo: true, stock: { lt: 5 } },
      }),
    );
  });
});
