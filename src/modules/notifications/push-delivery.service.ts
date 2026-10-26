import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as webPush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';
import { allowsPush } from './notification-events';

const include = {
  subscription: true,
  recipient: {
    include: {
      campaign: true,
      user: {
        select: { activo: true, rol: true, notificationPreference: true },
      },
    },
  },
} satisfies Prisma.PushDeliveryInclude;
type Job = Prisma.PushDeliveryGetPayload<{ include: typeof include }>;

class PushError extends Error {
  constructor(
    readonly code: string,
    readonly permanent = false,
    readonly deactivate = false,
  ) {
    super(code);
  }
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class PushDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushDeliveryService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  webConfig() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const subject = this.config.get<string>('VAPID_SUBJECT')?.trim();
    return { publicKey: publicKey && privateKey && subject ? publicKey : null };
  }

  onModuleInit() {
    // First run is delayed until all Nest providers (including Prisma) are ready.
    this.timer = setInterval(() => void this.processPending(), 5000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processPending() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const jobs = await this.prisma.pushDelivery.findMany({
        where: {
          status: { in: ['PENDING', 'ACCEPTED'] },
          nextAttemptAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: 30,
        include,
      });
      for (const job of jobs) {
        const claimed = await this.prisma.pushDelivery.updateMany({
          where: {
            id: job.id,
            status: job.status,
            nextAttemptAt: { lte: new Date() },
            OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
          },
          data: { leaseUntil: new Date(Date.now() + 120000) },
        });
        if (claimed.count !== 1) continue;
        try {
          if (job.status === 'ACCEPTED') await this.checkReceipt(job);
          else await this.deliver(job);
        } catch (error) {
          await this.failed(job, error);
        }
      }
    } catch (error) {
      this.logger.error(
        `No se pudo procesar la cola push: ${error instanceof Error ? error.name : 'Error'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async deliver(job: Job) {
    // Refresh after claiming: another process may have changed ownership or preferences.
    const current = await this.prisma.pushDelivery.findUniqueOrThrow({
      where: { id: job.id },
      include,
    });
    const { recipient, subscription } = current;
    const securityEvent = recipient.campaign.source === 'SECURITY';
    const session = await this.prisma.userSession.findFirst({
      where: {
        tokenId: subscription.sessionTokenId,
        userId: recipient.userId,
        // Credential changes revoke sessions in the same transaction. Those
        // devices may still receive the generic security alert for that change.
        ...(securityEvent
          ? {
              OR: [
                { endedAt: null },
                { endedAt: { gte: recipient.campaign.createdAt } },
              ],
            }
          : { endedAt: null }),
        expiresAt: {
          gt: securityEvent ? recipient.campaign.createdAt : new Date(),
        },
      },
      select: { id: true },
    });
    if (
      !subscription.active ||
      subscription.userId !== recipient.userId ||
      !recipient.user.activo ||
      recipient.user.rol !== 'CLIENT' ||
      !session ||
      !allowsPush(
        recipient.user.notificationPreference,
        recipient.campaign.category,
      )
    ) {
      await this.finish(job.id, {
        status: 'SKIPPED',
        errorCode: 'PREFERENCES_OR_SESSION',
      });
      return;
    }
    const campaign = recipient.campaign;
    const payload = {
      notificationId: recipient.id,
      title: campaign.title,
      body: campaign.body,
    };
    if (subscription.channel === 'WEB') {
      if (!this.webConfig().publicKey)
        throw new PushError('WEB_PUSH_NOT_CONFIGURED', true);
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh!, auth: subscription.auth! },
          },
          JSON.stringify(payload),
          {
            TTL: 3600,
            timeout: 10000,
            vapidDetails: {
              subject: this.config.getOrThrow<string>('VAPID_SUBJECT'),
              publicKey: this.config.getOrThrow<string>('VAPID_PUBLIC_KEY'),
              privateKey: this.config.getOrThrow<string>('VAPID_PRIVATE_KEY'),
            },
          },
        );
      } catch (error) {
        const status = record(error).statusCode;
        throw new PushError(
          `WEB_${typeof status === 'number' ? status : 'NETWORK'}`,
          typeof status === 'number' &&
            status >= 400 &&
            status < 500 &&
            status !== 429,
          status === 404 || status === 410,
        );
      }
      // Web Push only confirms provider acceptance, not device delivery.
      await this.finish(job.id, {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        nextAttemptAt: new Date('9999-01-01'),
      });
      return;
    }
    const response = await this.expoRequest('send', {
      to: subscription.endpoint,
      title: campaign.title,
      body: campaign.body,
      data: { notificationId: recipient.id, userId: recipient.userId },
      sound: 'default',
      channelId: 'cemydi',
      ttl: 3600,
    });
    const ticket = record(response.data);
    if (ticket.status !== 'ok' || typeof ticket.id !== 'string')
      throw this.expoError(ticket);
    await this.finish(job.id, {
      status: 'ACCEPTED',
      receiptId: ticket.id,
      acceptedAt: new Date(),
      nextAttemptAt: new Date(Date.now() + 15 * 60000),
    });
  }

  private async checkReceipt(job: Job) {
    if (!job.receiptId) return;
    const response = await this.expoRequest('getReceipts', {
      ids: [job.receiptId],
    });
    const receipt = record(record(response.data)[job.receiptId]);
    if (receipt.status === 'ok') {
      await this.finish(job.id, { status: 'DELIVERED', errorCode: null });
    } else if (receipt.status === 'error') {
      // A receipt failure is final; resending an accepted ticket risks duplicates.
      const error = this.expoError(receipt);
      await this.failed(job, new PushError(error.code, true, error.deactivate));
    } else if (
      job.acceptedAt &&
      Date.now() - job.acceptedAt.getTime() > 24 * 3600000
    ) {
      await this.finish(job.id, {
        status: 'FAILED',
        errorCode: 'RECEIPT_UNAVAILABLE',
      });
    } else {
      await this.finish(job.id, {
        nextAttemptAt: new Date(Date.now() + 15 * 60000),
      });
    }
  }

  private expoError(value: Record<string, unknown>) {
    const code = record(value.details).error;
    const known = typeof code === 'string' ? code : 'INVALID_EXPO_RESPONSE';
    return new PushError(
      known,
      [
        'DeviceNotRegistered',
        'MessageTooBig',
        'InvalidCredentials',
        'MismatchSenderId',
      ].includes(known),
      known === 'DeviceNotRegistered',
    );
  }

  private async expoRequest(path: 'send' | 'getReceipts', body: object) {
    const token = this.config.get<string>('EXPO_ACCESS_TOKEN')?.trim();
    const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok)
      throw new PushError(
        `EXPO_HTTP_${response.status}`,
        response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429,
      );
    const result: unknown = await response.json();
    return record(result);
  }

  private async failed(job: Job, error: unknown) {
    const attemptCount = job.attemptCount + 1;
    const failure =
      error instanceof PushError
        ? error
        : new PushError('NETWORK_OR_PROVIDER_ERROR');
    if (failure.deactivate)
      await this.prisma.pushSubscription.updateMany({
        // Do not disable a token that has since moved to another account/session.
        where: {
          id: job.subscriptionId,
          userId: job.recipient.userId,
          sessionTokenId: job.subscription.sessionTokenId,
        },
        data: { active: false },
      });
    await this.finish(job.id, {
      status: failure.permanent || attemptCount >= 5 ? 'FAILED' : job.status,
      attemptCount,
      errorCode: failure.code,
      nextAttemptAt: new Date(
        Date.now() + Math.min(3600000, 30000 * 2 ** attemptCount),
      ),
    });
  }

  private finish(id: string, data: Prisma.PushDeliveryUpdateInput) {
    return this.prisma.pushDelivery.update({
      where: { id },
      data: { ...data, leaseUntil: null },
    });
  }
}
