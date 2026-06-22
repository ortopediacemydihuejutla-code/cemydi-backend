import { Inject, Injectable, Logger } from '@nestjs/common';
import { POSTGRES_ADVISORY_LOCK_KEYS } from '../../../../infrastructure/database-tools/postgres-advisory-lock.constants';
import { PostgresAdvisoryLockService } from '../../../../infrastructure/database-tools/postgres-advisory-lock.service';
import { MaintenanceRepositoryPort } from '../../domain/ports/maintenance-repository.port';
import { MaintenanceLogService } from '../../domain/services/maintenance-log.service';
import { MaintenanceScheduleService } from '../../domain/services/maintenance-schedule.service';
import { MaintenanceUseCasesService } from '../../application/use-cases/maintenance-use-cases.service';

@Injectable()
export class MaintenanceSchedulerService {
  private readonly logger = new Logger(MaintenanceSchedulerService.name);
  private readonly schedulerPollMs = 60_000;

  private schedulerTimer: NodeJS.Timeout | null = null;
  private schedulerInProgress = false;

  constructor(
    @Inject(MaintenanceRepositoryPort)
    private readonly repository: MaintenanceRepositoryPort,
    private readonly maintenanceScheduleService: MaintenanceScheduleService,
    private readonly maintenanceUseCasesService: MaintenanceUseCasesService,
    private readonly maintenanceLogService: MaintenanceLogService,
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
        POSTGRES_ADVISORY_LOCK_KEYS.MAINTENANCE_SCHEDULER,
        async () => this.runLockedAutomationTick(),
      );
      if (result === null) {
        return;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `No se pudo ejecutar el programador de mantenimiento: ${message}`,
      );

      try {
        const schedule =
          await this.maintenanceScheduleService.getOrCreateScheduleRow();
        await this.maintenanceScheduleService.updateScheduleExecutionDates(
          schedule.id,
          this.maintenanceScheduleService.parseOptionalDate(schedule.lastRunAt),
          this.maintenanceScheduleService.computeNextRunAt(
            new Date(),
            this.maintenanceScheduleService.toSafeNumber(schedule.intervalDays),
            schedule.runAtTime,
            this.maintenanceScheduleService.parseOptionalDate(
              schedule.lastRunAt,
            ),
          ),
        );
      } catch {
        // Si tampoco se puede recalcular, evitamos romper el loop.
      }
    } finally {
      this.schedulerInProgress = false;
    }
  }

  private async runLockedAutomationTick() {
    if (!(await this.repository.tableExists('database_maintenance_schedule'))) {
      return;
    }

    const schedule =
      await this.maintenanceScheduleService.getOrCreateScheduleRow();
    const now = new Date();

    await this.maintenanceScheduleService.ensurePersistedNextRunAt(
      schedule,
      now,
    );

    if (!schedule.isEnabled) {
      return;
    }

    const dueAt = this.maintenanceScheduleService.parseOptionalDate(
      schedule.nextRunAt,
    );
    if (!dueAt || dueAt.getTime() > now.getTime()) {
      return;
    }

    this.logger.log(
      `Iniciando mantenimiento automatico ${this.maintenanceLogService.formatOperationLabel(schedule.operation)} para ${
        schedule.tableName
          ? schedule.tableName
          : schedule.schemaName
            ? `el esquema ${schedule.schemaName}`
            : 'toda la base de datos'
      }`,
    );

    const result = await this.maintenanceUseCasesService.executeMaintenance({
      operation: schedule.operation,
      schemaName: schedule.schemaName,
      tableName: schedule.tableName,
    });
    const executedAt = new Date(result.finishedAt);
    const refreshedSchedule =
      await this.maintenanceScheduleService.getOrCreateScheduleRow();
    const nextRunAt = this.maintenanceScheduleService.computeNextRunAt(
      executedAt,
      this.maintenanceScheduleService.toSafeNumber(
        refreshedSchedule.intervalDays,
      ),
      refreshedSchedule.runAtTime,
      executedAt,
    );

    await this.maintenanceScheduleService.updateScheduleExecutionDates(
      refreshedSchedule.id,
      executedAt,
      nextRunAt,
    );

    this.logger.log(
      `Mantenimiento automatico completado: ${this.maintenanceLogService.formatOperationLabel(schedule.operation)}`,
    );
  }
}
