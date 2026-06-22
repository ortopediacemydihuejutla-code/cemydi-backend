import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { parseQualifiedPostgresName } from '../../../../infrastructure/database-tools';
import {
  computeScheduleNextRunAt,
  normalizePositiveScheduleInteger,
  normalizeScheduleBoolean,
  normalizeScheduleTimeValue,
  parseOptionalScheduleDate,
  toIsoScheduleDate,
  toSafeScheduleNumber,
} from '../../../../infrastructure/scheduling';
import { MaintenanceRepositoryPort } from '../ports/maintenance-repository.port';
import {
  MaintenanceOperation,
  MaintenanceSchedulePayload,
  MaintenanceScheduleRow,
  MaintenanceScheduleSummary,
} from '../../dto/maintenance.types';

@Injectable()
export class MaintenanceScheduleService {
  readonly scheduleDefaults = {
    enabled: false,
    everyDays: 1,
    runAtTime: '04:00',
    operation: 'VACUUM_ANALYZE' as MaintenanceOperation,
    tableName: null as string | null,
  } as const;

  readonly scheduleRowId = 1;
  private readonly maintenanceSchemas = [
    'accounts',
    'catalog',
    'management',
  ] as const;

  constructor(
    @Inject(MaintenanceRepositoryPort)
    private readonly repository: MaintenanceRepositoryPort,
  ) {}

  async getSchedule() {
    if (!(await this.repository.tableExists('database_maintenance_schedule'))) {
      return this.mapScheduleSummary(this.createDefaultScheduleRow());
    }

    return this.mapScheduleSummary(await this.getOrCreateScheduleRow());
  }

  async updateSchedule(payload: Record<string, unknown>) {
    await this.repository.ensureRequiredTable(
      'database_maintenance_schedule',
      'No se pudo guardar la programacion de mantenimiento porque la tabla database_maintenance_schedule no existe. Ejecuta la migracion o crea la tabla manualmente.',
    );
    const existing = await this.getOrCreateScheduleRow();
    const normalized = await this.normalizeSchedulePayload(payload);
    const nextRunAt = normalized.enabled
      ? computeScheduleNextRunAt(
          new Date(),
          normalized.everyDays,
          normalized.runAtTime,
          parseOptionalScheduleDate(existing.lastRunAt),
        )
      : null;
    const now = new Date();
    const updated = await this.repository.upsertMaintenanceScheduleRow(
      {
        id: this.scheduleRowId,
        isEnabled: normalized.enabled,
        intervalDays: normalized.everyDays,
        runAtTime: normalized.runAtTime,
        operation: normalized.operation,
        schemaName: normalized.schemaName,
        tableName: normalized.tableName,
        lastRunAt: parseOptionalScheduleDate(existing.lastRunAt),
        nextRunAt,
        createdAt: parseOptionalScheduleDate(existing.createdAt) ?? now,
        updatedAt: now,
      },
      true,
    );

    if (!updated) {
      throw new InternalServerErrorException(
        'No se pudo guardar la programacion automatica de mantenimiento',
      );
    }

    return this.mapScheduleSummary(updated);
  }

  async deleteSchedule() {
    await this.repository.ensureRequiredTable(
      'database_maintenance_schedule',
      'No se pudo eliminar la programacion de mantenimiento porque la tabla database_maintenance_schedule no existe. Ejecuta la migracion o crea la tabla manualmente.',
    );
    const existing = await this.getOrCreateScheduleRow();
    const now = new Date();
    const reset = await this.repository.upsertMaintenanceScheduleRow(
      {
        id: this.scheduleRowId,
        isEnabled: false,
        intervalDays: this.scheduleDefaults.everyDays,
        runAtTime: this.scheduleDefaults.runAtTime,
        operation: this.scheduleDefaults.operation,
        schemaName: null,
        tableName: null,
        lastRunAt: parseOptionalScheduleDate(existing.lastRunAt),
        nextRunAt: null,
        createdAt: parseOptionalScheduleDate(existing.createdAt) ?? now,
        updatedAt: now,
      },
      true,
    );

    if (!reset) {
      throw new InternalServerErrorException(
        'No se pudo eliminar la programacion automatica de mantenimiento',
      );
    }

    return this.mapScheduleSummary(reset);
  }

  async ensurePersistedNextRunAt(schedule: MaintenanceScheduleRow, now: Date) {
    const nextRunAt = parseOptionalScheduleDate(schedule.nextRunAt);
    if (nextRunAt) {
      return;
    }

    const computedNextRunAt = computeScheduleNextRunAt(
      now,
      toSafeScheduleNumber(schedule.intervalDays),
      schedule.runAtTime,
      parseOptionalScheduleDate(schedule.lastRunAt),
    );

    await this.updateScheduleExecutionDates(
      schedule.id,
      parseOptionalScheduleDate(schedule.lastRunAt),
      computedNextRunAt,
    );
  }

  async getOrCreateScheduleRow(): Promise<MaintenanceScheduleRow> {
    if (!(await this.repository.tableExists('database_maintenance_schedule'))) {
      return this.createDefaultScheduleRow();
    }

    const existing = await this.repository.getMaintenanceScheduleRow();
    if (existing) {
      return existing;
    }

    const now = new Date();
    const created = await this.repository.upsertMaintenanceScheduleRow(
      {
        id: this.scheduleRowId,
        isEnabled: this.scheduleDefaults.enabled,
        intervalDays: this.scheduleDefaults.everyDays,
        runAtTime: this.scheduleDefaults.runAtTime,
        operation: this.scheduleDefaults.operation,
        schemaName: null,
        tableName: this.scheduleDefaults.tableName,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: now,
        updatedAt: now,
      },
      false,
    );

    return created ?? this.getOrCreateScheduleRow();
  }

  async updateScheduleExecutionDates(
    id: number,
    lastRunAt: Date | null,
    nextRunAt: Date | null,
  ) {
    await this.repository.updateScheduleExecutionDates(
      id,
      lastRunAt,
      nextRunAt,
    );
  }

  async normalizeSchedulePayload(
    payload: Record<string, unknown>,
  ): Promise<MaintenanceSchedulePayload> {
    const tableName = await this.normalizeOptionalTableName(payload.tableName);
    const schemaName = this.normalizeRequestedSchemaName(
      payload.schemaName,
      tableName,
    );

    return {
      enabled: this.normalizeBoolean(
        payload.enabled,
        'activar el mantenimiento automatico',
      ),
      everyDays: this.normalizePositiveInteger(
        payload.everyDays,
        'la frecuencia en dias',
        365,
      ),
      runAtTime: this.normalizeTimeValue(payload.runAtTime),
      operation: this.normalizeOperation(payload.operation),
      schemaName,
      tableName,
    };
  }

  async normalizeOptionalTableName(rawValue: unknown) {
    const normalized =
      this.normalizeOptionalText(rawValue)?.toLowerCase() ?? '';

    if (!normalized) {
      return null;
    }

    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/.test(normalized)) {
      throw new BadRequestException('Nombre de tabla invalido');
    }

    const tables = await this.repository.listMaintenanceTableNames();
    if (!tables.includes(normalized)) {
      throw new NotFoundException('La tabla seleccionada no existe');
    }

    return normalized;
  }

  normalizeOperation(rawValue: unknown): MaintenanceOperation {
    const normalized = (this.normalizeOptionalText(rawValue) ?? '')
      .toUpperCase()
      .replace(/\s+/g, '_');

    if (normalized.includes('FULL')) {
      throw new BadRequestException('VACUUM FULL no esta permitido');
    }

    if (
      normalized === 'VACUUM' ||
      normalized === 'ANALYZE' ||
      normalized === 'VACUUM_ANALYZE'
    ) {
      return normalized;
    }

    throw new BadRequestException('Operacion de mantenimiento invalida');
  }

  normalizeRequestedSchemaName(
    rawSchemaName: unknown,
    tableName: string | null,
  ) {
    if (tableName) {
      return this.parseQualifiedTableName(tableName).schema;
    }

    return this.normalizeOptionalSchemaName(rawSchemaName);
  }

  createDefaultScheduleRow(): MaintenanceScheduleRow {
    const now = new Date();
    return {
      id: this.scheduleRowId,
      isEnabled: this.scheduleDefaults.enabled,
      intervalDays: this.scheduleDefaults.everyDays,
      runAtTime: this.scheduleDefaults.runAtTime,
      operation: this.scheduleDefaults.operation,
      schemaName: null,
      tableName: this.scheduleDefaults.tableName,
      lastRunAt: null,
      nextRunAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  mapScheduleSummary(row: MaintenanceScheduleRow): MaintenanceScheduleSummary {
    return {
      enabled: row.isEnabled,
      everyDays: toSafeScheduleNumber(row.intervalDays),
      runAtTime: row.runAtTime,
      operation: row.operation,
      schemaName: row.schemaName,
      tableName: row.tableName,
      lastRunAt: toIsoScheduleDate(row.lastRunAt),
      nextRunAt: toIsoScheduleDate(row.nextRunAt),
      createdAt: toIsoScheduleDate(row.createdAt) ?? new Date().toISOString(),
      updatedAt: toIsoScheduleDate(row.updatedAt) ?? new Date().toISOString(),
    };
  }

  computeNextRunAt(
    now: Date,
    everyDays: number,
    runAtTime: string,
    lastRunAt?: Date | null,
  ) {
    return computeScheduleNextRunAt(now, everyDays, runAtTime, lastRunAt);
  }

  parseOptionalDate(value: Date | string | null | undefined) {
    return parseOptionalScheduleDate(value);
  }

  toSafeNumber(value: bigint | number | string | undefined) {
    return toSafeScheduleNumber(value);
  }

  private normalizeOptionalSchemaName(rawValue: unknown) {
    const normalized =
      this.normalizeOptionalText(rawValue)?.toLowerCase() ?? '';

    if (!normalized) {
      return null;
    }

    if (
      !this.maintenanceSchemas.includes(
        normalized as (typeof this.maintenanceSchemas)[number],
      )
    ) {
      throw new BadRequestException('Nombre de esquema invalido');
    }

    return normalized;
  }

  private parseQualifiedTableName(tableName: string) {
    const parsed = parseQualifiedPostgresName(
      tableName,
      this.maintenanceSchemas,
    );
    if (!parsed) {
      throw new BadRequestException('Nombre de tabla invalido');
    }

    return { schema: parsed.schema, table: parsed.name };
  }

  private normalizeBoolean(value: unknown, fieldLabel: string) {
    try {
      return normalizeScheduleBoolean(value, fieldLabel);
    } catch {
      throw new BadRequestException(`Valor invalido para ${fieldLabel}`);
    }
  }

  private normalizePositiveInteger(
    value: unknown,
    fieldLabel: string,
    maxValue: number,
  ) {
    try {
      return normalizePositiveScheduleInteger(value, fieldLabel, maxValue);
    } catch {
      throw new BadRequestException(
        `Valor invalido para ${fieldLabel}. Debe ser un entero entre 1 y ${maxValue}`,
      );
    }
  }

  private normalizeTimeValue(value: unknown) {
    try {
      return normalizeScheduleTimeValue(value);
    } catch {
      throw new BadRequestException(
        'La hora programada debe tener formato HH:mm en horario de 24 horas',
      );
    }
  }

  private normalizeOptionalText(value: unknown) {
    return typeof value === 'string' ? value.trim() : null;
  }
}
