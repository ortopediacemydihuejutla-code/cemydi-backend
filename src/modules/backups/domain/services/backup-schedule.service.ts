import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  computeScheduleNextRunAt,
  normalizePositiveScheduleInteger,
  normalizeScheduleBoolean,
  normalizeScheduleTimeValue,
  parseOptionalScheduleDate,
  toIsoScheduleDate,
  toSafeScheduleNumber,
} from '../../../../infrastructure/scheduling';
import { BackupRepositoryPort } from '../ports/backup-repository.port';
import {
  BackupSchedulePayload,
  BackupScheduleRow,
  BackupScheduleSummary,
} from '../../dto/backups.types';

@Injectable()
export class BackupScheduleService {
  readonly scheduleDefaults = {
    enabled: false,
    everyDays: 1,
    runAtTime: '03:00',
    retentionDays: 7,
  } as const;

  readonly scheduleRowId = 1;
  private readonly backupSchemas = [
    'accounts',
    'catalog',
    'management',
  ] as const;

  constructor(
    @Inject(BackupRepositoryPort)
    private readonly repository: BackupRepositoryPort,
  ) {}

  async getDatabaseBackupSchedule(): Promise<BackupScheduleSummary> {
    if (!(await this.repository.tableExists('database_backup_schedule'))) {
      return this.mapBackupScheduleSummary(this.createDefaultScheduleRow());
    }

    const row = await this.getOrCreateBackupScheduleRow();
    return this.mapBackupScheduleSummary(row);
  }

  async updateDatabaseBackupSchedule(
    payload: Record<string, unknown>,
  ): Promise<BackupScheduleSummary> {
    await this.repository.ensureRequiredTable(
      'database_backup_schedule',
      'No se pudo guardar la programacion de respaldos porque la tabla database_backup_schedule no existe. Ejecuta las migraciones de Prisma.',
    );
    const existing = await this.getOrCreateBackupScheduleRow();
    const normalized = this.normalizeSchedulePayload(payload);
    const nextRunAt = normalized.enabled
      ? computeScheduleNextRunAt(
          new Date(),
          normalized.everyDays,
          normalized.runAtTime,
          parseOptionalScheduleDate(existing.lastRunAt),
        )
      : null;
    const now = new Date();

    const updated = await this.repository.upsertBackupScheduleRow(
      {
        id: this.scheduleRowId,
        isEnabled: normalized.enabled,
        intervalDays: normalized.everyDays,
        runAtTime: normalized.runAtTime,
        retentionDays: normalized.retentionDays,
        schemaName: normalized.schemaName,
        lastRunAt: parseOptionalScheduleDate(existing.lastRunAt),
        nextRunAt,
        createdAt: parseOptionalScheduleDate(existing.createdAt) ?? now,
        updatedAt: now,
      },
      true,
    );

    if (!updated) {
      throw new InternalServerErrorException(
        'No se pudo guardar la programacion de respaldos',
      );
    }

    return this.mapBackupScheduleSummary(updated);
  }

  async deleteDatabaseBackupSchedule(): Promise<BackupScheduleSummary> {
    await this.repository.ensureRequiredTable(
      'database_backup_schedule',
      'No se pudo eliminar la programacion de respaldos porque la tabla database_backup_schedule no existe. Ejecuta las migraciones de Prisma.',
    );
    const existing = await this.getOrCreateBackupScheduleRow();
    const now = new Date();

    const reset = await this.repository.upsertBackupScheduleRow(
      {
        id: this.scheduleRowId,
        isEnabled: this.scheduleDefaults.enabled,
        intervalDays: this.scheduleDefaults.everyDays,
        runAtTime: this.scheduleDefaults.runAtTime,
        retentionDays: this.scheduleDefaults.retentionDays,
        schemaName: null,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: parseOptionalScheduleDate(existing.createdAt) ?? now,
        updatedAt: now,
      },
      true,
    );

    if (!reset) {
      throw new InternalServerErrorException(
        'No se pudo eliminar la programacion automatica de respaldos',
      );
    }

    return this.mapBackupScheduleSummary(reset);
  }

  async getOrCreateBackupScheduleRow(): Promise<BackupScheduleRow> {
    if (!(await this.repository.tableExists('database_backup_schedule'))) {
      return this.createDefaultScheduleRow();
    }

    const existing = await this.repository.getBackupScheduleRow();
    if (existing) {
      return existing;
    }

    const now = new Date();
    const created = await this.repository.upsertBackupScheduleRow(
      {
        id: this.scheduleRowId,
        isEnabled: this.scheduleDefaults.enabled,
        intervalDays: this.scheduleDefaults.everyDays,
        runAtTime: this.scheduleDefaults.runAtTime,
        retentionDays: this.scheduleDefaults.retentionDays,
        schemaName: null,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: now,
        updatedAt: now,
      },
      false,
    );

    return created ?? this.getOrCreateBackupScheduleRow();
  }

  async ensurePersistedNextRunAt(schedule: BackupScheduleRow, now: Date) {
    if (!schedule.isEnabled) {
      if (schedule.nextRunAt) {
        await this.updateScheduleExecutionDates(
          schedule.id,
          parseOptionalScheduleDate(schedule.lastRunAt),
          null,
        );
      }
      return;
    }

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

  createDefaultScheduleRow(): BackupScheduleRow {
    const now = new Date();
    return {
      id: this.scheduleRowId,
      isEnabled: this.scheduleDefaults.enabled,
      intervalDays: this.scheduleDefaults.everyDays,
      runAtTime: this.scheduleDefaults.runAtTime,
      retentionDays: this.scheduleDefaults.retentionDays,
      schemaName: null,
      lastRunAt: null,
      nextRunAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  mapBackupScheduleSummary(row: BackupScheduleRow): BackupScheduleSummary {
    return {
      enabled: row.isEnabled,
      everyDays: toSafeScheduleNumber(row.intervalDays),
      runAtTime: row.runAtTime,
      retentionDays: toSafeScheduleNumber(row.retentionDays),
      schemaName: row.schemaName,
      lastRunAt: toIsoScheduleDate(row.lastRunAt),
      nextRunAt: toIsoScheduleDate(row.nextRunAt),
      createdAt: toIsoScheduleDate(row.createdAt) ?? new Date().toISOString(),
      updatedAt: toIsoScheduleDate(row.updatedAt) ?? new Date().toISOString(),
    };
  }

  normalizeSchedulePayload(
    payload: Record<string, unknown>,
  ): BackupSchedulePayload {
    const schemaName = this.normalizeOptionalSchemaName(payload.schemaName);

    return {
      enabled: this.normalizeBoolean(
        payload.enabled,
        'activar los respaldos automaticos',
      ),
      everyDays: this.normalizePositiveInteger(
        payload.everyDays,
        'la frecuencia en dias',
        365,
      ),
      runAtTime: this.normalizeTimeValue(payload.runAtTime),
      retentionDays: this.normalizePositiveInteger(
        payload.retentionDays,
        'la retencion de respaldos',
        3650,
      ),
      schemaName,
    };
  }

  normalizeTableName(tableName: string) {
    const normalized = String(tableName ?? '')
      .trim()
      .toLowerCase();

    if (!normalized) {
      throw new BadRequestException(
        'Selecciona una tabla para generar el respaldo',
      );
    }

    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/.test(normalized)) {
      throw new BadRequestException('Nombre de tabla invalido');
    }

    return normalized;
  }

  normalizeSchemaName(schemaName: string) {
    const normalized = String(schemaName ?? '')
      .trim()
      .toLowerCase();

    if (!normalized) {
      throw new BadRequestException(
        'Selecciona un esquema para generar el respaldo',
      );
    }

    if (
      !this.backupSchemas.includes(
        normalized as (typeof this.backupSchemas)[number],
      )
    ) {
      throw new BadRequestException('Nombre de esquema invalido');
    }

    return normalized;
  }

  normalizeOptionalSchemaName(rawValue: unknown) {
    const normalized =
      this.normalizeOptionalText(rawValue)?.toLowerCase() ?? '';

    if (!normalized) {
      return null;
    }

    if (
      !this.backupSchemas.includes(
        normalized as (typeof this.backupSchemas)[number],
      )
    ) {
      throw new BadRequestException('Nombre de esquema invalido');
    }

    return normalized;
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
