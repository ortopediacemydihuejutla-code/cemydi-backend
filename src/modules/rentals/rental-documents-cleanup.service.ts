import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RentalDocumentsService } from './rental-documents.service';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class RentalDocumentsCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RentalDocumentsCleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly documents: RentalDocumentsService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.documents.cleanupDueDocuments().catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Error desconocido';
        this.logger.error(
          `Fallo la limpieza de recetas temporales: ${message}`,
        );
      });
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
