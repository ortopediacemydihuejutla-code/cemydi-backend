import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MaintenanceRepositoryPort } from '../../domain/ports/maintenance-repository.port';
import {
  MaintenanceScheduleRow,
  PersistMaintenanceScheduleRowInput,
} from '../../dto/maintenance.types';

@Injectable()
export class PrismaMaintenanceRepository implements MaintenanceRepositoryPort {
  private readonly managementSchema = 'management';
  private readonly scheduleRowId = 1;
  private maintenanceScheduleSchemaColumnExists: boolean | null = null;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async tableExists(tableName: string) {
    const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = ${this.managementSchema}
          AND table_name = ${tableName}
          AND table_type = 'BASE TABLE'
      ) AS "exists"
    `;

    return rows[0]?.exists === true;
  }

  async ensureRequiredTable(tableName: string, message: string) {
    if (await this.tableExists(tableName)) {
      return;
    }

    throw new InternalServerErrorException(message);
  }

  async listMaintenanceTableNames(schemaName?: string | null) {
    const rows = await this.prisma.$queryRaw<Array<{ tableName: string }>>`
      SELECT (tables.table_schema || '.' || tables.table_name) AS "tableName"
      FROM information_schema.tables AS tables
      WHERE tables.table_schema IN ('accounts', 'catalog', 'management')
        AND (${schemaName ?? null}::text IS NULL OR tables.table_schema = ${schemaName ?? null})
        AND tables.table_type = 'BASE TABLE'
        AND NOT (
          tables.table_schema = 'management'
          AND tables.table_name = '_prisma_migrations'
        )
      ORDER BY tables.table_schema ASC, tables.table_name ASC
    `;

    return rows.map((item) => item.tableName);
  }

  async getMaintenanceScheduleRow() {
    const hasSchemaNameColumn = await this.hasMaintenanceScheduleSchemaColumn();
    const schemaSelection = hasSchemaNameColumn
      ? `"schemaName"`
      : `NULL::text AS "schemaName"`;

    const rows = await this.prisma.$queryRawUnsafe(
      `
        SELECT
          "id",
          "isEnabled",
          "intervalDays",
          "runAtTime",
          "operation",
          ${schemaSelection},
          "tableName",
          "lastRunAt",
          "nextRunAt",
          "createdAt",
          "updatedAt"
        FROM "management"."database_maintenance_schedule"
        WHERE "id" = $1
        LIMIT 1
      `,
      this.scheduleRowId,
    );

    return this.getScheduleRow(this.toUnknownArray(rows));
  }

  async upsertMaintenanceScheduleRow(
    row: PersistMaintenanceScheduleRowInput,
    overwriteExisting: boolean,
  ) {
    const hasSchemaNameColumn = await this.hasMaintenanceScheduleSchemaColumn();
    const schemaColumns = hasSchemaNameColumn ? `, "schemaName"` : '';
    const schemaValuePlaceholder = hasSchemaNameColumn ? `, $6` : '';
    const schemaUpdate = hasSchemaNameColumn
      ? `"schemaName" = EXCLUDED."schemaName",`
      : '';
    const schemaSelection = hasSchemaNameColumn
      ? `"schemaName"`
      : `NULL::text AS "schemaName"`;
    const conflictAction = overwriteExisting
      ? `
        DO UPDATE
        SET
          "isEnabled" = EXCLUDED."isEnabled",
          "intervalDays" = EXCLUDED."intervalDays",
          "runAtTime" = EXCLUDED."runAtTime",
          "operation" = EXCLUDED."operation",
          ${schemaUpdate}
          "tableName" = EXCLUDED."tableName",
          "lastRunAt" = EXCLUDED."lastRunAt",
          "nextRunAt" = EXCLUDED."nextRunAt",
          "updatedAt" = EXCLUDED."updatedAt"
      `
      : `DO NOTHING`;

    const params = hasSchemaNameColumn
      ? [
          row.id,
          row.isEnabled,
          row.intervalDays,
          row.runAtTime,
          row.operation,
          row.schemaName,
          row.tableName,
          row.lastRunAt,
          row.nextRunAt,
          row.createdAt,
          row.updatedAt,
        ]
      : [
          row.id,
          row.isEnabled,
          row.intervalDays,
          row.runAtTime,
          row.operation,
          row.tableName,
          row.lastRunAt,
          row.nextRunAt,
          row.createdAt,
          row.updatedAt,
        ];

    const sql = hasSchemaNameColumn
      ? `
        INSERT INTO "management"."database_maintenance_schedule" (
          "id",
          "isEnabled",
          "intervalDays",
          "runAtTime",
          "operation"${schemaColumns},
          "tableName",
          "lastRunAt",
          "nextRunAt",
          "createdAt",
          "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5${schemaValuePlaceholder}, $7, $8, $9, $10, $11)
        ON CONFLICT ("id")
        ${conflictAction}
        RETURNING
          "id",
          "isEnabled",
          "intervalDays",
          "runAtTime",
          "operation",
          ${schemaSelection},
          "tableName",
          "lastRunAt",
          "nextRunAt",
          "createdAt",
          "updatedAt"
      `
      : `
        INSERT INTO "management"."database_maintenance_schedule" (
          "id",
          "isEnabled",
          "intervalDays",
          "runAtTime",
          "operation",
          "tableName",
          "lastRunAt",
          "nextRunAt",
          "createdAt",
          "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT ("id")
        ${conflictAction}
        RETURNING
          "id",
          "isEnabled",
          "intervalDays",
          "runAtTime",
          "operation",
          ${schemaSelection},
          "tableName",
          "lastRunAt",
          "nextRunAt",
          "createdAt",
          "updatedAt"
      `;

    const rows = await this.prisma.$queryRawUnsafe(sql, ...params);
    return this.getScheduleRow(this.toUnknownArray(rows));
  }

  async updateScheduleExecutionDates(
    id: number,
    lastRunAt: Date | null,
    nextRunAt: Date | null,
  ) {
    await this.prisma.$queryRaw`
      UPDATE "management"."database_maintenance_schedule"
      SET
        "lastRunAt" = ${lastRunAt},
        "nextRunAt" = ${nextRunAt},
        "updatedAt" = ${new Date()}
      WHERE "id" = ${id}
    `;
  }

  private async hasMaintenanceScheduleSchemaColumn() {
    if (this.maintenanceScheduleSchemaColumnExists !== null) {
      return this.maintenanceScheduleSchemaColumnExists;
    }

    const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'management'
          AND table_name = 'database_maintenance_schedule'
          AND column_name = 'schemaName'
      ) AS "exists"
    `;

    this.maintenanceScheduleSchemaColumnExists = rows[0]?.exists === true;
    return this.maintenanceScheduleSchemaColumnExists;
  }

  private toUnknownArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private getScheduleRow(rows: unknown[]): MaintenanceScheduleRow | null {
    if (rows.length === 0) {
      return null;
    }

    const candidate = rows[0];
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }

    const row = candidate as Partial<MaintenanceScheduleRow>;
    if (
      typeof row.id !== 'number' ||
      typeof row.isEnabled !== 'boolean' ||
      typeof row.runAtTime !== 'string' ||
      typeof row.operation !== 'string'
    ) {
      return null;
    }

    return row as MaintenanceScheduleRow;
  }
}
