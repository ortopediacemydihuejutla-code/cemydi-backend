import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountDeletionService } from './account-deletion.service';

@Injectable()
export class AccountDeletionWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(AccountDeletionWorker.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly deletion: AccountDeletionService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.run();
    }, 60_000);
    this.timer.unref();
    void this.run();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma.asAdmin().accountDeletionRequest.updateMany({
        where: { codeExpiresAt: { lte: new Date() } },
        data: { codeHash: null, codeExpiresAt: null },
      });
      const due = await this.prisma.asAdmin().accountDeletionRequest.findMany({
        where: {
          confirmedAt: { not: null },
          completedAt: null,
          nextAttemptAt: { lte: new Date() },
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: 25,
      });
      for (const request of due) await this.deletion.process(request.id);
    } catch {
      this.logger.error(
        'La eliminación de cuentas tiene solicitudes pendientes de reintento.',
      );
    } finally {
      this.running = false;
    }
  }
}
