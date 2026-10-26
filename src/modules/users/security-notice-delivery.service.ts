import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SecurityNoticeDeliveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SecurityNoticeDeliveryService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    void this.deliverPending();
    this.timer = setInterval(() => void this.deliverPending(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async deliverPending() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const notices = await this.prisma.asAdmin().securityNotice.findMany({
        where: {
          deliveredAt: null,
          nextAttemptAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      for (const notice of notices) {
        const claimed = await this.prisma.asAdmin().securityNotice.updateMany({
          where: {
            id: notice.id,
            deliveredAt: null,
            nextAttemptAt: { lte: new Date() },
            OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
          },
          data: { leaseUntil: new Date(Date.now() + 120_000) },
        });
        if (claimed.count !== 1) continue;
        const emailChanged =
          notice.kind === 'EMAIL_CHANGED' ||
          notice.kind === 'ADMIN_EMAIL_CHANGED';
        const subject = emailChanged
          ? 'Se cambió el correo de tu cuenta CEMYDI'
          : 'Se cambió la contraseña de tu cuenta CEMYDI';
        const text = emailChanged
          ? 'Se cambió el correo de tu cuenta CEMYDI. Si no lo solicitaste, contacta a soporte.'
          : 'Se cambió la contraseña de tu cuenta CEMYDI. Si no lo solicitaste, contacta a soporte.';
        try {
          await this.mail.sendEmail({
            to: notice.correo,
            subject,
            html: `<p>${text}</p>`,
            text,
            tag: 'security-notice',
          });
          await this.prisma.asAdmin().securityNotice.update({
            where: { id: notice.id },
            data: { deliveredAt: new Date(), leaseUntil: null },
          });
        } catch (error) {
          const attemptCount = notice.attemptCount + 1;
          const delayMs = Math.min(
            3_600_000,
            60_000 * 2 ** Math.min(attemptCount, 6),
          );
          await this.prisma.asAdmin().securityNotice.update({
            where: { id: notice.id },
            data: {
              attemptCount,
              leaseUntil: null,
              nextAttemptAt: new Date(Date.now() + delayMs),
            },
          });
          this.logger.warn(
            `No se pudo entregar aviso de seguridad id=${notice.id} tipo=${error instanceof Error ? error.name : 'Error'}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `No se pudo procesar la cola de avisos de seguridad. tipo=${error instanceof Error ? error.name : 'Error'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
