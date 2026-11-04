import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReviewsService } from './reviews.service';
import type { NotificationEvent } from '../notifications/notification-events';
import type { AuthUser } from '../auth/types/auth-user.interface';

const admin: AuthUser = {
  sub: 8,
  id: 8,
  sid: 'admin-session',
  rol: 'ADMIN',
  correo: 'admin@example.test',
};
const pending = {
  id: 12,
  userId: 7,
  productId: 10,
  rating: 5,
  comment: 'Buen producto',
  status: ReviewStatus.PENDING,
  showOnHome: false,
  updatedAt: new Date('2026-11-01T12:00:00Z'),
};
function fixture() {
  const tx = {
    review: {
      findUnique: jest.fn().mockResolvedValue(pending),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ ...pending, status: ReviewStatus.APPROVED }),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    notificationCampaign: {
      create: jest
        .fn<Promise<{ id: string }>, [{ data: NotificationEvent }]>()
        .mockResolvedValue({ id: 'campaign' }),
    },
    notificationRecipient: {
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ id: 'notice', userId: 7 }]),
    },
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'expo-device',
          userId: 7,
          user: { notificationPreference: null },
        },
      ]),
    },
    pushDelivery: { createMany: jest.fn() },
  };
  const transaction = jest.fn(
    (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const service = new ReviewsService({
    $transaction: transaction,
  } as unknown as PrismaService);
  return { tx, transaction, service };
}

describe('review moderation and notification outbox', () => {
  it.each(['APPROVED', 'REJECTED'] as const)(
    'guarda %s y su aviso para el propietario en la misma transacción',
    async (status) => {
      const { tx, transaction, service } = fixture();
      tx.review.findUniqueOrThrow.mockResolvedValue({ ...pending, status });
      const result = await (status === 'APPROVED'
        ? service.approve(admin, 12)
        : service.reject(admin, 12));
      expect(result.review.status).toBe(status);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(tx.review.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 12,
            status: 'PENDING',
            updatedAt: pending.updatedAt,
            comment: pending.comment,
            rating: 5,
          },
        }),
      );
      expect(tx.notificationCampaign.create.mock.calls[0][0]).toMatchObject({
        data: {
          source: 'REVIEW_STATUS',
          category: 'SYSTEM',
          destinationType: 'PRODUCT',
          destinationId: '10',
          title: status === 'APPROVED' ? 'Reseña aprobada' : 'Reseña rechazada',
          createdById: 8,
        },
      });
      expect(tx.notificationRecipient.createMany).toHaveBeenCalledWith({
        data: [{ campaignId: 'campaign', userId: 7 }],
      });
      expect(tx.pushDelivery.createMany).toHaveBeenCalledWith({
        data: [{ recipientId: 'notice', subscriptionId: 'expo-device' }],
        skipDuplicates: true,
      });
    },
  );
  it('rechazar una reseña publicada la quita de Inicio y limpia su aprobación', async () => {
    const { tx, service } = fixture();
    tx.review.findUnique.mockResolvedValue({
      ...pending,
      status: ReviewStatus.APPROVED,
      showOnHome: true,
    });
    await service.reject(admin, 12);
    expect(tx.review.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'REJECTED',
          showOnHome: false,
          approvedAt: null,
          approvedById: null,
        },
      }),
    );
  });
  it.each(['APPROVED', 'REJECTED'] as const)(
    'repetir %s no vuelve a guardar ni enviar avisos',
    async (status) => {
      const { tx, service } = fixture();
      tx.review.findUnique.mockResolvedValue({ ...pending, status });
      await (status === 'APPROVED'
        ? service.approve(admin, 12)
        : service.reject(admin, 12));
      expect(tx.review.updateMany).not.toHaveBeenCalled();
      expect(tx.notificationCampaign.create).not.toHaveBeenCalled();
    },
  );
  it('un cambio concurrente no sobrescribe la reseña ni genera aviso', async () => {
    const { tx, service } = fixture();
    tx.review.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approve(admin, 12)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.notificationCampaign.create).not.toHaveBeenCalled();
  });
  it('si falla la bandeja falla la transacción completa', async () => {
    const { tx, service } = fixture();
    tx.notificationCampaign.create.mockRejectedValue(
      new Error('outbox unavailable'),
    );
    await expect(service.approve(admin, 12)).rejects.toThrow(
      'outbox unavailable',
    );
    expect(tx.pushDelivery.createMany).not.toHaveBeenCalled();
  });
  it('la preferencia Sistema desactivada conserva bandeja y omite push', async () => {
    const { tx, service } = fixture();
    tx.pushSubscription.findMany.mockResolvedValue([
      {
        id: 'expo-device',
        userId: 7,
        user: {
          notificationPreference: {
            pushEnabled: true,
            system: false,
            offers: true,
            rentals: true,
          },
        },
      },
    ]);
    await service.reject(admin, 12);
    expect(tx.notificationRecipient.createMany).toHaveBeenCalled();
    expect(tx.pushDelivery.createMany).not.toHaveBeenCalled();
  });
  it('no envía avisos a cuentas inactivas o administrativas', async () => {
    const { tx, service } = fixture();
    tx.user.findFirst.mockResolvedValue(null);
    await service.approve(admin, 12);
    expect(tx.user.findFirst).toHaveBeenCalledWith({
      where: { id: 7, rol: 'CLIENT', activo: true },
      select: { id: true },
    });
    expect(tx.notificationCampaign.create).not.toHaveBeenCalled();
  });
  it('un id inexistente no actualiza ni genera avisos', async () => {
    const { tx, service } = fixture();
    tx.review.findUnique.mockResolvedValue(null);
    await expect(service.reject(admin, 12)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.review.updateMany).not.toHaveBeenCalled();
    expect(tx.notificationCampaign.create).not.toHaveBeenCalled();
  });
});
