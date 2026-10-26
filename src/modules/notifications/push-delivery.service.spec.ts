/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_PREFERENCES } from './notification-events';
import { PushDeliveryService } from './push-delivery.service';

function fixture() {
  const job = {
    id: 'job',
    recipientId: 'inbox',
    subscriptionId: 'subscription',
    status: 'PENDING',
    attemptCount: 0,
    receiptId: null as string | null,
    acceptedAt: null as Date | null,
    subscription: {
      id: 'subscription',
      userId: 7,
      sessionTokenId: 'session',
      active: true,
      channel: 'EXPO',
      endpoint: 'ExpoPushToken[token]',
    },
    recipient: {
      id: 'inbox',
      userId: 7,
      campaign: {
        title: 'Aviso',
        body: 'Mensaje',
        category: 'OFFER',
        source: 'MANUAL',
        createdAt: new Date(),
      },
      user: {
        rol: 'CLIENT',
        activo: true,
        notificationPreference: { ...DEFAULT_PREFERENCES },
      },
    },
  };
  const db = {
    pushDelivery: {
      findMany: jest.fn().mockResolvedValue([job]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(job),
      update: jest.fn(),
    },
    pushSubscription: { updateMany: jest.fn() },
    userSession: { findFirst: jest.fn().mockResolvedValue({ id: 'session' }) },
  };
  const service = new PushDeliveryService(
    db as unknown as PrismaService,
    { get: () => undefined } as unknown as ConfigService,
  );
  return { job, db, service };
}

describe('PushDeliveryService', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });
  it('does not send a job claimed by another worker', async () => {
    const { db, service } = fixture();
    db.pushDelivery.updateMany.mockResolvedValue({ count: 0 });
    await service.processPending();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['preferences', 'session', 'ownership'])(
    'rechecks %s before delivery',
    async (reason) => {
      const { job, db, service } = fixture();
      if (reason === 'preferences')
        job.recipient.user.notificationPreference.offers = false;
      if (reason === 'session')
        db.userSession.findFirst.mockResolvedValue(null);
      if (reason === 'ownership') job.subscription.userId = 99;
      await service.processPending();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.pushDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SKIPPED',
            leaseUntil: null,
          }),
        }),
      );
    },
  );
  it('stores Expo tickets for later receipt validation, without claiming device delivery', async () => {
    const { db, service } = fixture();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { status: 'ok', id: 'receipt' } }),
    });
    await service.processPending();
    expect(db.pushDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACCEPTED',
          receiptId: 'receipt',
        }),
      }),
    );
  });
  it('permits only sessions active at the security event, including those revoked by that change', async () => {
    const { job, db, service } = fixture();
    job.recipient.campaign.source = 'SECURITY';
    job.recipient.campaign.category = 'SYSTEM';
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { status: 'ok', id: 'receipt' } }),
    });
    await service.processPending();
    expect(db.userSession.findFirst).toHaveBeenCalledWith({
      where: {
        tokenId: 'session',
        userId: 7,
        OR: [
          { endedAt: null },
          { endedAt: { gte: job.recipient.campaign.createdAt } },
        ],
        expiresAt: { gt: job.recipient.campaign.createdAt },
      },
      select: { id: true },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('retries transient failures with a delayed attempt and released lease', async () => {
    const { db, service } = fixture();
    fetchMock.mockRejectedValue(new Error('network'));
    await service.processPending();
    expect(db.pushDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          attemptCount: 1,
          leaseUntil: null,
          nextAttemptAt: expect.any(Date),
        }),
      }),
    );
  });
  it('deactivates tokens rejected by Expo', async () => {
    const { db, service } = fixture();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { status: 'error', details: { error: 'DeviceNotRegistered' } },
        }),
    });
    await service.processPending();
    expect(db.pushSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'subscription', userId: 7, sessionTokenId: 'session' },
        data: { active: false },
      }),
    );
    expect(db.pushDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorCode: 'DeviceNotRegistered',
        }),
      }),
    );
  });
  it('checks accepted Expo receipts without sending the notification again', async () => {
    const { job, db, service } = fixture();
    job.status = 'ACCEPTED';
    job.receiptId = 'receipt';
    job.acceptedAt = new Date();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { receipt: { status: 'ok' } } }),
    });
    await service.processPending();
    expect(fetchMock.mock.calls[0][0]).toContain('/getReceipts');
    expect(db.pushDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DELIVERED' }),
      }),
    );
  });
  it('marks missing web configuration as failure without any provider request', async () => {
    const { job, db, service } = fixture();
    job.subscription.channel = 'WEB';
    await service.processPending();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.pushDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorCode: 'WEB_PUSH_NOT_CONFIGURED',
        }),
      }),
    );
  });
});
