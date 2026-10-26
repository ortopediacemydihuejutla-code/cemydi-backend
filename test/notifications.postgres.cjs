// Optional integration check against a local, migrated PostgreSQL database.
// Uses disposable selected recipients and never contacts a push provider.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const {
  NotificationsService,
} = require('../dist/modules/notifications/notifications.service');
const {
  PushDeliveryService,
} = require('../dist/modules/notifications/push-delivery.service');
const {
  persistAutomaticNotification,
} = require('../dist/modules/notifications/notification-events');

async function main() {
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(process.env.DATABASE_URL).hostname,
    )
  ) {
    throw new Error(
      'This integration check only runs against local PostgreSQL.',
    );
  }
  const prisma = new PrismaClient();
  const userIds = [];
  const campaignIds = [];
  const tag = randomUUID();
  const originalFetch = global.fetch;
  let providerCalls = 0;
  global.fetch = async () => {
    providerCalls += 1;
    throw new Error('Push network disabled in this check');
  };
  try {
    const admin = await prisma.user.create({
      data: {
        nombre: 'Notification QA admin',
        correo: `qa-admin-${tag}@example.invalid`,
        password: 'not-a-login-password',
        rol: 'ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(admin.id);
    const clients = [];
    for (let index = 0; index < 2; index += 1) {
      const client = await prisma.user.create({
        data: {
          nombre: 'Notification QA client',
          correo: `qa-client-${index}-${tag}@example.invalid`,
          password: 'not-a-login-password',
          rol: 'CLIENT',
          emailVerifiedAt: new Date(),
        },
      });
      userIds.push(client.id);
      clients.push(client);
    }
    const [first, second] = clients;
    const service = new NotificationsService(prisma);
    const preferences = {
      pushEnabled: true,
      system: true,
      offers: true,
      rentals: true,
    };
    await service.savePreferences(second.id, { ...preferences, offers: false });
    for (const client of clients) {
      await prisma.userSession.create({
        data: {
          tokenId: `qa-${tag}-${client.id}`,
          userId: client.id,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      await service.registerPush(
        {
          id: client.id,
          sub: client.id,
          rol: 'CLIENT',
          sid: `qa-${tag}-${client.id}`,
        },
        { channel: 'EXPO', endpoint: `ExpoPushToken[qa_${tag}_${client.id}]` },
      );
    }
    const payload = {
      requestId: randomUUID(),
      category: 'OFFER',
      title: 'Integración de notificaciones',
      body: 'Mensaje de prueba local',
      audience: 'SELECTED',
      userIds: clients.map((client) => client.id),
      destinationType: 'NONE',
    };
    const sent = await service.send(admin.id, payload);
    campaignIds.push(sent.id);
    assert.equal((await service.send(admin.id, payload)).id, sent.id);
    assert.equal(
      await prisma.notificationRecipient.count({
        where: { campaignId: sent.id },
      }),
      2,
    );
    assert.equal(
      await prisma.pushDelivery.count({
        where: { recipient: { campaignId: sent.id } },
      }),
      1,
    );
    const inbox = await service.inbox(first.id, {});
    const owned = inbox.items[0].id;
    await assert.rejects(() => service.detail(second.id, owned));
    await service.markRead(second.id, [owned]);
    assert.equal((await service.detail(first.id, owned)).item.readAt, null);
    await service.markRead(first.id, [owned]);
    assert.ok(
      (await new NotificationsService(prisma).detail(first.id, owned)).item
        .readAt,
    );
    await service.savePreferences(first.id, { ...preferences, offers: false });
    assert.equal(
      (await new NotificationsService(prisma).preferences(first.id)).preferences
        .offers,
      false,
    );
    const scopedWorkerDb = {
      pushDelivery: {
        ...prisma.pushDelivery,
        findMany: (args) =>
          prisma.pushDelivery.findMany({
            ...args,
            where: {
              AND: [args.where, { recipient: { campaignId: sent.id } }],
            },
          }),
      },
      userSession: prisma.userSession,
      pushSubscription: prisma.pushSubscription,
    };
    await new PushDeliveryService(scopedWorkerDb, {
      get: () => undefined,
    }).processPending();
    assert.equal(providerCalls, 0);
    assert.equal(
      await prisma.pushDelivery.count({
        where: { recipient: { campaignId: sent.id }, status: 'SKIPPED' },
      }),
      1,
    );
    const rollbackKey = `qa-rollback:${tag}`;
    await assert.rejects(() =>
      prisma.$transaction(async (tx) => {
        await persistAutomaticNotification(tx, 'security', first.id, {
          requestKey: rollbackKey,
          source: 'SECURITY',
          category: 'SYSTEM',
          title: 'Cambio de seguridad',
          body: 'Prueba de rollback',
          destinationType: 'ACCOUNT',
        });
        throw new Error('Expected rollback');
      }),
    );
    assert.equal(
      await prisma.notificationCampaign.count({
        where: { requestKey: rollbackKey },
      }),
      0,
    );
    const history = await service.history({ page: 1 });
    assert.ok(
      history.items.some(
        (item) =>
          item.id === sent.id &&
          item.recipientCount === 2 &&
          item.pushes.SKIPPED === 1,
      ),
    );
    for (let index = 0; index < 21; index += 1) {
      const campaign = await prisma.notificationCampaign.create({
        data: {
          requestKey: `qa-read-all:${tag}:${index}`,
          category: index % 2 ? 'SYSTEM' : 'OFFER',
          title: 'Lectura global de prueba',
          body: 'Aviso local sin entregas push',
          recipients: {
            create: {
              userId: first.id,
              createdAt: new Date(Date.now() - 60000),
            },
          },
        },
      });
      campaignIds.push(campaign.id);
    }
    assert.equal((await service.inbox(first.id, {})).unreadCount, 21);
    await service.markAllRead(first.id);
    assert.equal((await service.inbox(first.id, {})).unreadCount, 0);
    assert.equal(
      (await service.inbox(first.id, { page: 2 })).items.every(
        (item) => item.readAt,
      ),
      true,
    );
    assert.equal((await service.inbox(second.id, {})).unreadCount, 1);
    const originalReadAt = (await service.detail(first.id, owned)).item.readAt;
    await service.markAllRead(first.id);
    assert.equal(
      (await service.detail(first.id, owned)).item.readAt.getTime(),
      originalReadAt.getTime(),
    );
    console.log(
      'PASS PostgreSQL: selected delivery, idempotency, ownership, shared preferences, late opt-out, read state, transactional rollback and history. No push requests.',
    );
  } finally {
    global.fetch = originalFetch;
    await prisma.notificationCampaign.deleteMany({
      where: { id: { in: campaignIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: userIds }, correo: { endsWith: '@example.invalid' } },
    });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Integration check failed',
  );
  process.exitCode = 1;
});
