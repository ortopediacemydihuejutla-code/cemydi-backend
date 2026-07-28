import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminNotificationsService } from './admin-notifications.service';

describe('AdminNotificationsService', () => {
  const prisma = {
    rentalRequest: { findMany: jest.fn() },
    review: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
    adminNotificationRead: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
  };

  let service: AdminNotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.adminNotificationRead.findMany.mockResolvedValue([]);
    prisma.adminNotificationRead.createMany.mockResolvedValue({ count: 0 });

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

    const result = await service.listCurrent(11, 40);

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'rental:rental-1',
          category: 'rental',
          href: '/admin/rentals',
          readAt: null,
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

    await service.listCurrent(11);

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

  it('devuelve el estado leído persistido para el administrador actual', async () => {
    prisma.rentalRequest.findMany.mockResolvedValue([
      {
        id: 'rental-1',
        folio: 'REN-2026-000001',
        createdAt: new Date('2026-07-20T10:00:00.000Z'),
        user: { nombre: 'Ana', correo: 'ana@example.com' },
      },
    ]);
    prisma.review.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.adminNotificationRead.findMany.mockResolvedValue([
      {
        notificationId: 'rental:rental-1',
        readAt: new Date('2026-07-20T11:00:00.000Z'),
      },
    ]);

    const result = await service.listCurrent(11);

    expect(prisma.adminNotificationRead.findMany).toHaveBeenCalledWith({
      where: {
        userId: 11,
        notificationId: { in: ['rental:rental-1'] },
      },
      select: {
        notificationId: true,
        readAt: true,
      },
    });
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'rental:rental-1',
        readAt: '2026-07-20T11:00:00.000Z',
      }),
    );
  });

  it('persiste las notificaciones leídas de forma idempotente', async () => {
    const result = await service.markAsRead(11, [
      'rental:rental-1',
      'rental:rental-1',
      ' review:8 ',
    ]);

    expect(prisma.adminNotificationRead.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 11,
          notificationId: 'rental:rental-1',
        }),
        expect.objectContaining({
          userId: 11,
          notificationId: 'review:8',
        }),
      ],
      skipDuplicates: true,
    });
    expect(result.ids).toEqual(['rental:rental-1', 'review:8']);
    expect(result.readAt).toEqual(expect.any(String));
  });
});
