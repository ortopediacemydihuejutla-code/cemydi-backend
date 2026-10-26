/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './notification.dto';
import {
  DEFAULT_PREFERENCES,
  allowsPush,
  notifyRentalStatus,
  notifySecurityChange,
  persistAutomaticNotification,
  persistNotification,
} from './notification-events';
import { validatePushSubscription } from './push-validation';

function fixture() {
  const db = {
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 7 }]),
      findFirst: jest.fn().mockResolvedValue({ id: 7 }),
    },
    notificationCampaign: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'campaign' }),
    },
    notificationRecipient: {
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ id: 'inbox', userId: 7 }]),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ id: 'subscription' }),
      updateMany: jest.fn(),
    },
    pushDelivery: { createMany: jest.fn() },
    notificationAutomation: { findUnique: jest.fn().mockResolvedValue(null) },
    notificationPreference: {
      upsert: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    rentalRequest: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ userId: 7, folio: 'REN-1' }),
    },
    product: {
      findFirst: jest.fn().mockResolvedValue({ id: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    promotion: {
      findUnique: jest.fn().mockResolvedValue({ id: 2 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) =>
    callback(db),
  );
  return {
    db,
    service: new NotificationsService(db as unknown as PrismaService),
  };
}
const payload: SendNotificationDto = {
  requestId: '17cb19b6-d0f8-41fc-a47e-fbd1ecfbfd90',
  category: 'OFFER',
  title: 'Oferta CEMYDI',
  body: 'Consulta nuestras ofertas',
  audience: 'SELECTED',
  userIds: [7],
  destinationType: 'NONE',
};
const event = {
  requestKey: 'event',
  source: 'SECURITY',
  category: 'SYSTEM' as const,
  title: 'Seguridad',
  body: 'Aviso de seguridad',
  destinationType: 'ACCOUNT',
};

describe('NotificationsService', () => {
  it('batches real offer previews and scopes the inbox to its owner', async () => {
    const { db, service } = fixture();
    const base = { userId: 7, createdAt: new Date(), readAt: null };
    const rows = [
      {
        ...base,
        id: 'one',
        campaign: {
          ...event,
          category: 'OFFER',
          destinationType: 'PRODUCT',
          destinationId: '1',
        },
      },
      {
        ...base,
        id: 'two',
        campaign: {
          ...event,
          category: 'OFFER',
          destinationType: 'PRODUCT',
          destinationId: '1',
        },
      },
      {
        ...base,
        id: 'three',
        campaign: {
          ...event,
          category: 'OFFER',
          destinationType: 'PROMOTION',
          destinationId: '2',
        },
      },
      {
        ...base,
        id: 'four',
        campaign: { ...event, destinationType: 'PRODUCT', destinationId: '99' },
      },
    ];
    db.$transaction.mockResolvedValueOnce([rows, 4, 4]);
    db.product.findMany.mockResolvedValueOnce([
      {
        id: 1,
        images: [{ imageUrl: 'https://images.example.invalid/product.webp' }],
      },
    ]);
    db.promotion.findMany.mockResolvedValueOnce([
      { id: 2, discountPercent: 20 },
    ]);
    const result = await service.inbox(7, {});
    expect(result.items[0].preview).toEqual({
      imageUrl: 'https://images.example.invalid/product.webp',
      discountPercent: null,
    });
    expect(result.items[2].preview).toEqual({
      imageUrl: null,
      discountPercent: 20,
    });
    expect(result.items[3].preview).toBeNull();
    expect(db.product.findMany).toHaveBeenCalledTimes(1);
    expect(db.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [1] }, activo: true } }),
    );
    expect(db.promotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [2] },
          startAt: { lte: expect.any(Date) },
          endAt: { gte: expect.any(Date) },
        },
      }),
    );
    expect(db.notificationRecipient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } }),
    );
  });
  it('keeps the inbox usable when an offer destination is inactive or expired', async () => {
    const { db, service } = fixture();
    db.$transaction.mockResolvedValueOnce([
      [
        {
          id: 'one',
          createdAt: new Date(),
          readAt: null,
          campaign: {
            ...event,
            category: 'OFFER',
            destinationType: 'PROMOTION',
            destinationId: '2',
          },
        },
      ],
      1,
      1,
    ]);
    expect((await service.inbox(7, {})).items[0].preview).toEqual({
      imageUrl: null,
      discountPercent: null,
    });
    expect(db.product.findMany).not.toHaveBeenCalled();
  });
  it('sends only to registered active clients and retries the same request without duplicates', async () => {
    const { db, service } = fixture();
    await service.send(1, payload);
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activo: true, rol: 'CLIENT', id: { in: [7] } },
      }),
    );
    expect(db.notificationRecipient.createMany).toHaveBeenCalledWith({
      data: [{ campaignId: 'campaign', userId: 7 }],
    });
    const stored = db.notificationCampaign.create.mock.calls[0][0] as {
      data: { payloadHash: string };
    };
    db.notificationCampaign.findUnique.mockResolvedValue({
      id: 'campaign',
      ...stored.data,
    });
    expect(await service.send(1, payload)).toMatchObject({ id: 'campaign' });
    expect(db.notificationCampaign.create).toHaveBeenCalledTimes(1);
    await expect(
      service.send(1, { ...payload, body: 'Otro contenido' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects blank content, empty selections, inactive recipients and mixed audiences', async () => {
    const { db, service } = fixture();
    await expect(
      service.send(1, { ...payload, title: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.send(1, { ...payload, userIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.send(1, { ...payload, audience: 'ALL' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    db.user.findMany.mockResolvedValue([]);
    await expect(service.send(1, payload)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.notificationCampaign.create).not.toHaveBeenCalled();
  });
  it('rejects a rental destination that is not owned by the sole selected client', async () => {
    const { db, service } = fixture();
    db.rentalRequest.findFirst.mockResolvedValue(null);
    await expect(
      service.send(1, {
        ...payload,
        destinationType: 'RENTAL',
        destinationId: 'rental',
      }),
    ).rejects.toThrow('propietario');
    expect(db.notificationCampaign.create).not.toHaveBeenCalled();
  });
  it('scopes detail and read mutations to the authenticated client', async () => {
    const { db, service } = fixture();
    await service.markRead(7, ['someone-elses-inbox']);
    expect(db.notificationRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['someone-elses-inbox'] }, userId: 7, readAt: null },
      }),
    );
    db.notificationRecipient.findFirst.mockResolvedValue(null);
    await expect(service.detail(7, 'not-owned')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.notificationRecipient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'not-owned', userId: 7 } }),
    );
  });
  it('marks every pending notification owned by the caller without a page or category limit', async () => {
    const { db, service } = fixture();
    await service.markAllRead(7);
    expect(db.notificationRecipient.updateMany).toHaveBeenCalledWith({
      where: { userId: 7, readAt: null, createdAt: { lte: expect.any(Date) } },
      data: { readAt: expect.any(Date) },
    });
    const call = db.notificationRecipient.updateMany.mock.calls[0][0];
    expect(call.where.createdAt.lte).toEqual(call.data.readAt);
  });
  it('persists preferences by user and never exposes another user id in the response', async () => {
    const { db, service } = fixture();
    expect(
      await service.savePreferences(7, {
        ...DEFAULT_PREFERENCES,
        offers: false,
      }),
    ).toEqual({ preferences: DEFAULT_PREFERENCES });
    expect(db.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 7 },
        update: { ...DEFAULT_PREFERENCES, offers: false },
      }),
    );
  });
  it('binds registrations to account and session; unregister cannot disable another account', async () => {
    const { db, service } = fixture();
    await service.registerPush(
      {
        id: 7,
        sub: 7,
        correo: 'client@test.dev',
        rol: 'CLIENT',
        sid: 'session',
      },
      { channel: 'EXPO', endpoint: 'ExpoPushToken[token123]' },
    );
    expect(db.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          userId: 7,
          sessionTokenId: 'session',
        }),
      }),
    );
    await service.unregisterPush(7, 'ExpoPushToken[token123]');
    expect(db.pushSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { identity: expect.any(String), userId: 7 },
      }),
    );
  });
});

describe('transactional notification events', () => {
  it('keeps inbox entries even when push is disabled, and queues only allowed categories', async () => {
    const { db } = fixture();
    db.pushSubscription.findMany.mockResolvedValue([
      {
        id: 'disabled',
        userId: 7,
        user: {
          notificationPreference: {
            ...DEFAULT_PREFERENCES,
            pushEnabled: false,
          },
        },
      },
      {
        id: 'system',
        userId: 7,
        user: { notificationPreference: DEFAULT_PREFERENCES },
      },
    ]);
    await persistNotification(db as never, event, [7]);
    expect(db.notificationRecipient.createMany).toHaveBeenCalled();
    expect(db.pushDelivery.createMany).toHaveBeenCalledWith({
      data: [{ recipientId: 'inbox', subscriptionId: 'system' }],
      skipDuplicates: true,
    });
    expect(allowsPush({ ...DEFAULT_PREFERENCES, offers: false }, 'OFFER')).toBe(
      false,
    );
    expect(
      allowsPush({ ...DEFAULT_PREFERENCES, rentals: false }, 'RENTAL'),
    ).toBe(false);
    expect(
      allowsPush({ ...DEFAULT_PREFERENCES, system: false }, 'SYSTEM'),
    ).toBe(false);
  });
  it('does not emit for disabled automation or administrators', async () => {
    const { db } = fixture();
    db.notificationAutomation.findUnique.mockResolvedValue({ security: false });
    await persistAutomaticNotification(db as never, 'security', 7, event);
    expect(db.user.findFirst).not.toHaveBeenCalled();
    db.notificationAutomation.findUnique.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue(null);
    await persistAutomaticNotification(db as never, 'security', 1, event);
    expect(db.notificationCampaign.create).not.toHaveBeenCalled();
  });
  it('stores rental and security events in the supplied business transaction', async () => {
    const { db } = fixture();
    await notifyRentalStatus(db as never, 'rental', 'APPROVED');
    expect(db.notificationCampaign.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: 'RENTAL',
        source: 'RENTAL_STATUS',
        title: 'Renta aprobada',
        destinationId: 'rental',
      }),
    });
    await notifySecurityChange(db as never, 7, true);
    expect(db.notificationCampaign.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        category: 'SYSTEM',
        source: 'SECURITY',
        title: 'Cambio de correo',
      }),
    });
  });
});

describe('push subscription validation', () => {
  it('blocks private/internal endpoints, credentials and lookalike hosts', () => {
    for (const endpoint of [
      'http://127.0.0.1/push',
      'https://localhost/push',
      'https://fcm.googleapis.com.evil.test/push',
      'https://user:pass@fcm.googleapis.com/push',
      'https://fcm.googleapis.com:8443/push',
    ]) {
      expect(() =>
        validatePushSubscription({ channel: 'WEB', endpoint }),
      ).toThrow(BadRequestException);
    }
    expect(() =>
      validatePushSubscription({ channel: 'EXPO', endpoint: 'invalid-token' }),
    ).toThrow(BadRequestException);
  });
  it('accepts official providers only with correctly shaped Web Push keys', () => {
    expect(() =>
      validatePushSubscription({
        channel: 'WEB',
        endpoint: 'https://fcm.googleapis.com/fcm/send/token',
        p256dh: Buffer.alloc(65, 1).toString('base64url'),
        auth: Buffer.alloc(16, 1).toString('base64url'),
      }),
    ).not.toThrow();
  });
});
