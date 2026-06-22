import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { MaintenanceExecutorPort } from '../../domain/ports/maintenance-executor.port';
import { MaintenanceRepositoryPort } from '../../domain/ports/maintenance-repository.port';
import { MaintenanceLogService } from '../../domain/services/maintenance-log.service';
import { MaintenanceScheduleService } from '../../domain/services/maintenance-schedule.service';
import { MaintenanceRunResult } from '../../dto/maintenance.types';

@Injectable()
export class MaintenanceUseCasesService {
  constructor(
    @Inject(MaintenanceRepositoryPort)
    private readonly repository: MaintenanceRepositoryPort,
    @Inject(MaintenanceExecutorPort)
    private readonly executor: MaintenanceExecutorPort,
    private readonly maintenanceLogService: MaintenanceLogService,
    private readonly maintenanceScheduleService: MaintenanceScheduleService,
  ) {}

  async run(payload: Record<string, unknown>): Promise<MaintenanceRunResult> {
    return this.executeMaintenance(payload);
  }

  async getSchedule() {
    return this.maintenanceScheduleService.getSchedule();
  }

  async updateSchedule(payload: Record<string, unknown>) {
    return this.maintenanceScheduleService.updateSchedule(payload);
  }

  async deleteSchedule() {
    return this.maintenanceScheduleService.deleteSchedule();
  }

  async executeMaintenance(
    payload: Record<string, unknown>,
  ): Promise<MaintenanceRunResult> {
    const operation = this.maintenanceScheduleService.normalizeOperation(
      payload.operation,
    );
    const requestedTableName =
      await this.maintenanceScheduleService.normalizeOptionalTableName(
        payload.tableName,
      );
    const requestedSchemaName =
      this.maintenanceScheduleService.normalizeRequestedSchemaName(
        payload.schemaName,
        requestedTableName,
      );
    const startedAt = new Date();

    const tables = requestedTableName
      ? [requestedTableName]
      : await this.repository.listMaintenanceTableNames(requestedSchemaName);

    if (tables.length === 0) {
      throw new NotFoundException(
        'No se encontraron tablas disponibles para ejecutar mantenimiento',
      );
    }

    const logs = this.maintenanceLogService.createStartLogs(
      operation,
      startedAt,
      requestedTableName,
      requestedSchemaName,
      tables.length,
    );

    try {
      let processedTables = 0;

      for (const [index, tableName] of tables.entries()) {
        const stepStart = new Date();
        logs.push(
          `${this.maintenanceLogService.formatLogStamp(stepStart)}  Procesando tabla ${tableName} (${index + 1}/${tables.length})`,
        );

        const execution = await this.executor.runPsqlCommand(
          operation,
          tableName,
        );
        if (execution.verboseLog) {
          logs.push(execution.verboseLog);
        }

        processedTables += 1;
        logs.push(
          `${this.maintenanceLogService.formatLogStamp(new Date())}  Tabla ${tableName} procesada correctamente`,
        );
      }

      return this.maintenanceLogService.createSuccessResult({
        operation,
        schemaName: requestedSchemaName,
        tableName: requestedTableName,
        processedTables,
        startedAt,
        finishedAt: new Date(),
        logs,
      });
    } catch (error) {
      throw new InternalServerErrorException(
        this.maintenanceLogService.createFailurePayload({
          operation,
          schemaName: requestedSchemaName,
          tableName: requestedTableName,
          startedAt,
          finishedAt: new Date(),
          logs,
          error,
        }),
      );
    }
  }
}
