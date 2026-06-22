import { Inject, Injectable, Logger } from '@nestjs/common';
import { POSTGRES_ADVISORY_LOCK_KEYS } from '../../../../infrastructure/database-tools/postgres-advisory-lock.constants';
import { PostgresAdvisoryLockService } from '../../../../infrastructure/database-tools/postgres-advisory-lock.service';
import { BackupRepositoryPort } from '../../domain/ports/backup-repository.port';
import { BackupScheduleService } from '../../domain/services/backup-schedule.service';
import { BackupsUseCasesService } from '../../application/use-cases/backups-use-cases.service';

@Injectable()
export class BackupsSchedulerService {
  private readonly logger = new Logger(BackupsSchedulerService.name);
  private readonly schedulerPollMs = 60_000;
  private readonly retentionPollMs = 60 * 60 * 1000;

  private schedulerTimer: NodeJS.Timeout | null = null;
  private schedulerInProgress = false;
  private lastRetentionSweepAt = 0;

  constructor(
    @Inject(BackupRepositoryPort)
    private readonly repository: BackupRepositoryPort,
    private readonly backupScheduleService: BackupScheduleService,
    private readonly backupsUseCasesService: BackupsUseCasesService,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
  ) {}

  start() {
    if (this.schedulerTimer) {
      return;
    }

    this.schedulerTimer = setInterval(() => {
      void this.runAutomationTick();
    }, this.schedulerPollMs);

    void this.runAutomationTick();
  }

  stop() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  async runAutomationTick() {
    if (this.schedulerInProgress) {
      return;
    }

    this.schedulerInProgress = true;

    try {
      const result = await this.advisoryLockService.runWithLock(
        POSTGRES_ADVISORY_LOCK_KEYS.BACKUPS_SCHEDULER,
        async () => this.runLockedAutomationTick(),
      );
      if (result === null) {
        return;
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido en el programador';
      this.logger.error(
        `No se pudo ejecutar el programador de respaldos: ${message}`,
      );
    } finally {
      this.schedulerInProgress = false;
    }
  }

  private async runLockedAutomationTick() {
    const [hasScheduleTable, hasBackupsTable] = await Promise.all([
      this.repository.tableExists('database_backup_schedule'),
      this.repository.tableExists('database_backups'),
    ]);
    if (!hasScheduleTable || !hasBackupsTable) {
      return;
    }

    const schedule =
      await this.backupScheduleService.getOrCreateBackupScheduleRow();
    const now = new Date();

    await this.backupScheduleService.ensurePersistedNextRunAt(schedule, now);

    if (schedule.isEnabled) {
      const dueAt = this.backupScheduleService.parseOptionalDate(
        schedule.nextRunAt,
      );
      if (dueAt && dueAt.getTime() <= now.getTime()) {
        this.logger.log(
          `Iniciando respaldo automatico programado para ${schedule.runAtTime} cada ${this.backupScheduleService.toSafeNumber(schedule.intervalDays)} dia(s)`,
        );

        const createdBackup = schedule.schemaName
          ? await this.backupsUseCasesService.createAutomaticSchemaBackupRecord(
              schedule.schemaName,
            )
          : await this.backupsUseCasesService.createAutomaticDatabaseBackupRecord();
        const executedAt = new Date(createdBackup.backup.createdAt);
        const refreshedSchedule =
          await this.backupScheduleService.getOrCreateBackupScheduleRow();
        const nextRunAt = this.backupScheduleService.computeNextRunAt(
          executedAt,
          this.backupScheduleService.toSafeNumber(
            refreshedSchedule.intervalDays,
          ),
          refreshedSchedule.runAtTime,
          executedAt,
        );

        await this.backupScheduleService.updateScheduleExecutionDates(
          refreshedSchedule.id,
          executedAt,
          nextRunAt,
        );

        this.logger.log(
          `Respaldo automatico completado: ${createdBackup.backup.fileName}`,
        );
        await this.backupsUseCasesService.applyRetentionPolicy();
      }
    }

    if (now.getTime() - this.lastRetentionSweepAt >= this.retentionPollMs) {
      await this.backupsUseCasesService.applyRetentionPolicy(
        this.backupScheduleService.toSafeNumber(schedule.retentionDays),
      );
      this.lastRetentionSweepAt = now.getTime();
    }
  }
}
