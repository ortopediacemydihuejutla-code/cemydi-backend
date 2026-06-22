import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { BackupRepositoryPort } from '../../domain/ports/backup-repository.port';
import {
  BackupOrigin,
  BackupRecordRow,
  BackupRecordSummary,
  BackupScheduleRow,
  PersistBackupScheduleRowInput,
} from '../../dto/backups.types';

@Injectable()
export class PrismaBackupRepository implements BackupRepositoryPort {
  private readonly managementSchema = 'management';
  private readonly scheduleRowId = 1;
  private backupScheduleSchemaColumnExists: boolean | null = null;

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

  async listDatabaseBackupRecords(): Promise<BackupRecordSummary[]> {
    const rows = await this.prisma.$queryRaw<BackupRecordRow[]>`
      SELECT "id", "fileName", "origin", "sizeBytes", "createdAt"
      FROM "management"."database_backups"
      ORDER BY "createdAt" DESC, "id" DESC
    `;

    return rows.map((item) => this.mapBackupRecordSummary(item));
  }

  async findDatabaseBackupRecordById(id: number) {
    const rows = await this.prisma.$queryRaw<BackupRecordRow[]>`
      SELECT "id", "fileName", "origin", "sizeBytes", "createdAt"
      FROM "management"."database_backups"
      WHERE "id" = ${id}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  async insertBackupRecord(backup: {
    fileName: string;
    origin: BackupOrigin;
    sizeBytes: number;
    createdAt: Date;
  }) {
    const createdRows = await this.prisma.$queryRaw<BackupRecordRow[]>`
      INSERT INTO "management"."database_backups" ("fileName", "origin", "sizeBytes", "createdAt")
      VALUES (
        ${backup.fileName},
        CAST(${backup.origin} AS "public"."BackupOrigin"),
        ${backup.sizeBytes},
        ${backup.createdAt}
      )
      RETURNING "id", "fileName", "origin", "sizeBytes", "createdAt"
    `;

    const created = createdRows[0];
    if (!created) {
      throw new Error('No se pudo guardar el registro del respaldo');
    }

    return this.mapBackupRecordSummary(created);
  }

  async deleteBackupRecordById(id: number) {
    const deletedRows = await this.prisma.$queryRaw<BackupRecordRow[]>`
      DELETE FROM "management"."database_backups"
      WHERE "id" = ${id}
      RETURNING "id", "fileName", "origin", "sizeBytes", "createdAt"
    `;

    return deletedRows[0] ?? null;
  }

  async restoreBackupRecord(record: BackupRecordRow) {
    await this.prisma.$queryRaw`
      INSERT INTO "management"."database_backups" ("id", "fileName", "origin", "sizeBytes", "createdAt")
      VALUES (
        ${record.id},
        ${record.fileName},
        CAST(${record.origin} AS "public"."BackupOrigin"),
        ${this.toSafeNumber(record.sizeBytes)},
        ${this.parseOptionalDate(record.createdAt) ?? new Date()}
      )
    `;
  }

  async listBackupTableNames() {
    const tableRows = await this.prisma.$queryRaw<Array<{ tableName: string }>>`
      SELECT (tables.table_schema || '.' || tables.table_name) AS "tableName"
      FROM information_schema.tables AS tables
      WHERE tables.table_schema IN ('accounts', 'catalog', 'management')
        AND tables.table_type = 'BASE TABLE'
        AND NOT (
          tables.table_schema = 'management'
          AND tables.table_name = '_prisma_migrations'
        )
      ORDER BY tables.table_schema ASC, tables.table_name ASC
    `;

    return tableRows.map((item) => item.tableName);
  }

  async listBackupSchemaNames() {
    const rows = await this.prisma.$queryRaw<Array<{ schemaName: string }>>`
      SELECT DISTINCT tables.table_schema AS "schemaName"
      FROM information_schema.tables AS tables
      WHERE tables.table_schema IN ('accounts', 'catalog', 'management')
        AND tables.table_type = 'BASE TABLE'
        AND NOT (
          tables.table_schema = 'management'
          AND tables.table_name = '_prisma_migrations'
        )
      ORDER BY tables.table_schema ASC
    `;

    return rows.map((item) => item.schemaName);
  }

  async listExpiredAutomaticBackups(cutoffDate: Date) {
    return this.prisma.$queryRaw<BackupRecordRow[]>`
      SELECT "id", "fileName", "origin", "sizeBytes", "createdAt"
      FROM "management"."database_backups"
      WHERE "createdAt" < ${cutoffDate}
        AND "origin"::text = ${'AUTOMATIC'}
      ORDER BY "createdAt" ASC, "id" ASC
    `;
  }

  async getBackupScheduleRow() {
    const hasSchemaNameColumn = await this.hasBackupScheduleSchemaColumn();
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
          "retentionDays",
          ${schemaSelection},
          "lastRunAt",
          "nextRunAt",
          "createdAt",
          "updatedAt"
        FROM "management"."database_backup_schedule"
        WHERE "id" = $1
        LIMIT 1
      `,
      this.scheduleRowId,
    );

    return this.getTypedScheduleRow(this.toUnknownArray(rows));
  }

  async upsertBackupScheduleRow(
    row: PersistBackupScheduleRowInput,
    overwriteExisting: boolean,
  ) {
    const hasSchemaNameColumn = await this.hasBackupScheduleSchemaColumn();
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
          "retentionDays" = EXCLUDED."retentionDays",
          ${schemaUpdate}
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
          row.retentionDays,
          row.schemaName,
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
          row.retentionDays,
          row.lastRunAt,
          row.nextRunAt,
          row.createdAt,
          row.updatedAt,
        ];

    const sql = hasSchemaNameColumn
      ? `
        INSERT INTO "management"."database_backup_schedule" (
          "id",
          "isEnabled",
          "intervalDays",
          "runAtTime",
          "retentionDays"${schemaColumns},
          "lastRunAt",
          "nextRunAt",
          "createdAt",
          "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5${schemaValuePlaceholder}, $7, $8, $9, $10)
        ON CONFLICT ("id")
        ${conflictAction}
        RETURNING
          "id",
          "isEnabled",
          "intervalDays",
          "runAtTime",
          "retentionDays",
          ${schemaSelection},
          "lastRunAt",
          "nextRunAt",
          "createdAt",
          "updatedAt"
      `
      : `
        INSERT INTO "management"."database_backup_schedule" (
          "id",
          "isEnabled",
          "intervalDays",
          "runAtTime",
          "retentionDays",
          "lastRunAt",
          "nextRunAt",
          "createdAt",
          "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT ("id")
        ${conflictAction}
        RETURNING
          "id",
          "isEnabled",
          "intervalDays",
          "runAtTime",
          "retentionDays",
          ${schemaSelection},
          "lastRunAt",
          "nextRunAt",
          "createdAt",
          "updatedAt"
      `;

    const rows = await this.prisma.$queryRawUnsafe(sql, ...params);
    return this.getTypedScheduleRow(this.toUnknownArray(rows));
  }

  async updateScheduleExecutionDates(
    id: number,
    lastRunAt: Date | null,
    nextRunAt: Date | null,
  ) {
    await this.prisma.$queryRaw`
      UPDATE "management"."database_backup_schedule"
      SET
        "lastRunAt" = ${lastRunAt},
        "nextRunAt" = ${nextRunAt},
        "updatedAt" = ${new Date()}
      WHERE "id" = ${id}
    `;
  }

  async getDatabaseStatus(providerLabel: string) {
    const hasPrismaMigrationsTable =
      await this.tableExists('_prisma_migrations');
    const [runtimeRows, tableRows, indexRows, connectionRows, initializedRows] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{
            databaseName: string;
            version: string;
            sizeBytes: bigint | number | string;
            totalIndexes: number;
          }>
        >`
          SELECT
            current_database() AS "databaseName",
            version() AS "version",
            pg_database_size(current_database()) AS "sizeBytes",
            (
              SELECT COUNT(*)::int
              FROM pg_indexes
              WHERE schemaname IN ('accounts', 'catalog', 'management')
                AND NOT (
                  schemaname = 'management'
                  AND tablename = '_prisma_migrations'
                )
            ) AS "totalIndexes"
        `,
        this.prisma.$queryRaw<
          Array<{
            tableName: string;
            rowCount: bigint | number | string;
            sequentialScans: bigint | number | string;
            indexScans: bigint | number | string;
            totalQueries: bigint | number | string;
            totalSizeBytes: bigint | number | string;
            tableSizeBytes: bigint | number | string;
            indexSizeBytes: bigint | number | string;
            indexUsagePercent: number | string;
          }>
        >`
          SELECT
            (stats.schemaname || '.' || stats.relname) AS "tableName",
            COALESCE(stats.n_live_tup, 0)::bigint AS "rowCount",
            COALESCE(stats.seq_scan, 0)::bigint AS "sequentialScans",
            COALESCE(stats.idx_scan, 0)::bigint AS "indexScans",
            (COALESCE(stats.seq_scan, 0) + COALESCE(stats.idx_scan, 0))::bigint AS "totalQueries",
            pg_total_relation_size(stats.relid)::bigint AS "totalSizeBytes",
            pg_relation_size(stats.relid)::bigint AS "tableSizeBytes",
            pg_indexes_size(stats.relid)::bigint AS "indexSizeBytes",
            CASE
              WHEN (COALESCE(stats.seq_scan, 0) + COALESCE(stats.idx_scan, 0)) > 0 THEN
                ROUND(
                  (
                    COALESCE(stats.idx_scan, 0)::numeric /
                    (COALESCE(stats.seq_scan, 0) + COALESCE(stats.idx_scan, 0))::numeric
                  ) * 100,
                  2
                )
              ELSE 0::numeric
            END AS "indexUsagePercent"
          FROM pg_stat_user_tables AS stats
          WHERE stats.schemaname IN ('accounts', 'catalog', 'management')
            AND NOT (
              stats.schemaname = 'management'
              AND stats.relname = '_prisma_migrations'
            )
          ORDER BY
            pg_total_relation_size(stats.relid) DESC,
            stats.schemaname ASC,
            stats.relname ASC
        `,
        this.prisma.$queryRaw<
          Array<{
            indexName: string;
            tableName: string;
            scans: bigint | number | string;
            sizeBytes: bigint | number | string;
          }>
        >`
          SELECT
            (index_stats.schemaname || '.' || index_stats.indexrelname) AS "indexName",
            (index_stats.schemaname || '.' || index_stats.relname) AS "tableName",
            COALESCE(index_stats.idx_scan, 0)::bigint AS "scans",
            pg_relation_size(index_stats.indexrelid)::bigint AS "sizeBytes"
          FROM pg_stat_user_indexes AS index_stats
          WHERE index_stats.schemaname IN ('accounts', 'catalog', 'management')
            AND NOT (
              index_stats.schemaname = 'management'
              AND index_stats.relname = '_prisma_migrations'
            )
          ORDER BY
            COALESCE(index_stats.idx_scan, 0) DESC,
            pg_relation_size(index_stats.indexrelid) DESC,
            index_stats.indexrelname ASC
          LIMIT 10
        `,
        this.prisma.$queryRaw<
          Array<{
            pid: number;
            userName: string;
            state: string | null;
            clientAddress: string | null;
            applicationName: string | null;
            backendType: string | null;
          }>
        >`
          SELECT
            pid::int AS "pid",
            COALESCE(usename, 'desconocido') AS "userName",
            state AS "state",
            CASE
              WHEN client_addr IS NULL AND backend_type = 'client backend' THEN 'local'
              WHEN client_addr IS NULL THEN 'interna'
              ELSE client_addr::text
            END AS "clientAddress",
            NULLIF(application_name, '') AS "applicationName",
            backend_type AS "backendType"
          FROM pg_stat_activity
          WHERE datname = current_database()
          ORDER BY
            CASE
              WHEN state = 'active' THEN 0
              WHEN state = 'idle in transaction' THEN 1
              WHEN state = 'idle' THEN 2
              ELSE 3
            END,
            pid ASC
        `,
        hasPrismaMigrationsTable
          ? this.prisma.$queryRaw<
              Array<{
                initializedAt: Date | string | null;
              }>
            >`
              SELECT
                COALESCE(MIN("finished_at"), MIN("started_at")) AS "initializedAt"
              FROM "management"."_prisma_migrations"
            `
          : Promise.resolve([{ initializedAt: null }]),
      ]);

    const runtime = runtimeRows[0];
    const initializedAt = this.parseOptionalDate(
      initializedRows[0]?.initializedAt ?? null,
    );
    const sizeBytes = this.toSafeNumber(runtime?.sizeBytes);
    const tableStats = tableRows.map((item) => {
      const totalSizeBytes = this.toSafeNumber(item.totalSizeBytes);
      const tableSizeBytes = this.toSafeNumber(item.tableSizeBytes);
      const indexSizeBytes = this.toSafeNumber(item.indexSizeBytes);
      const sequentialScans = this.toSafeNumber(item.sequentialScans);
      const indexScans = this.toSafeNumber(item.indexScans);
      const totalQueries = this.toSafeNumber(item.totalQueries);
      const indexUsagePercent = Number(item.indexUsagePercent ?? 0);

      return {
        tableName: item.tableName,
        rowCount: this.toSafeNumber(item.rowCount),
        sequentialScans,
        indexScans,
        totalQueries,
        totalSizeBytes,
        totalSizePretty: this.formatBytes(totalSizeBytes),
        tableSizeBytes,
        tableSizePretty: this.formatBytes(tableSizeBytes),
        indexSizeBytes,
        indexSizePretty: this.formatBytes(indexSizeBytes),
        indexUsagePercent: Number.isFinite(indexUsagePercent)
          ? Math.max(0, Math.min(100, indexUsagePercent))
          : 0,
      };
    });
    const topQueriedTables = [...tableStats]
      .sort(
        (a, b) =>
          b.totalQueries - a.totalQueries ||
          b.totalSizeBytes - a.totalSizeBytes,
      )
      .slice(0, 8);
    const indexStats = indexRows.map((item) => {
      const scans = this.toSafeNumber(item.scans);
      const indexSizeBytes = this.toSafeNumber(item.sizeBytes);

      return {
        indexName: item.indexName,
        tableName: item.tableName,
        scans,
        sizeBytes: indexSizeBytes,
        sizePretty: this.formatBytes(indexSizeBytes),
      };
    });
    let activeConnections = 0;
    let idleConnections = 0;
    let idleInTransactionConnections = 0;
    let otherConnections = 0;
    let internalConnections = 0;

    const connectionItems = connectionRows.map((item) => {
      const backendType = item.backendType?.trim() || 'client backend';
      const rawState = item.state?.trim().toLowerCase() || 'unknown';
      const normalizedState =
        backendType !== 'client backend'
          ? 'internal'
          : rawState === 'active'
            ? 'active'
            : rawState === 'idle'
              ? 'idle'
              : rawState === 'idle in transaction'
                ? 'idle in transaction'
                : 'other';

      if (normalizedState === 'active') {
        activeConnections += 1;
      } else if (normalizedState === 'idle') {
        idleConnections += 1;
      } else if (normalizedState === 'idle in transaction') {
        idleInTransactionConnections += 1;
      } else if (normalizedState === 'internal') {
        internalConnections += 1;
      } else {
        otherConnections += 1;
      }

      return {
        pid: item.pid,
        userName: item.userName,
        state: normalizedState,
        clientAddress: item.clientAddress?.trim() || 'desconocida',
        applicationName: item.applicationName?.trim() || 'Sin etiqueta',
        backendType,
      };
    });
    const groupedUsers = new Map<
      string,
      {
        userName: string;
        totalConnections: number;
        activeConnections: number;
        internalConnections: number;
      }
    >();
    for (const connection of connectionItems) {
      const existing = groupedUsers.get(connection.userName) ?? {
        userName: connection.userName,
        totalConnections: 0,
        activeConnections: 0,
        internalConnections: 0,
      };
      existing.totalConnections += 1;
      if (connection.state === 'active') {
        existing.activeConnections += 1;
      }
      if (connection.state === 'internal') {
        existing.internalConnections += 1;
      }
      groupedUsers.set(connection.userName, existing);
    }
    const databaseUsers = [...groupedUsers.values()].sort(
      (a, b) =>
        b.totalConnections - a.totalConnections ||
        b.activeConnections - a.activeConnections ||
        a.userName.localeCompare(b.userName),
    );

    const totalRows = tableStats.reduce((acc, item) => acc + item.rowCount, 0);
    const totalTableBytes = tableStats.reduce(
      (acc, item) => acc + item.totalSizeBytes,
      0,
    );
    const databaseAgeSeconds = initializedAt
      ? Math.max(0, Math.floor((Date.now() - initializedAt.getTime()) / 1000))
      : 0;

    return {
      checkedAt: new Date().toISOString(),
      isOnline: true,
      databaseName: runtime?.databaseName ?? 'unknown',
      dbVersion: runtime?.version ?? 'unknown',
      initializedAt: initializedAt?.toISOString() ?? null,
      databaseAgeSeconds,
      sizeBytes,
      sizePretty: this.formatBytes(sizeBytes),
      overview: {
        totalTables: tableStats.length,
        totalIndexes: runtime?.totalIndexes ?? indexStats.length,
        totalRows,
        totalSizeBytes: totalTableBytes,
        totalSizePretty: this.formatBytes(totalTableBytes),
      },
      connections: {
        total: connectionItems.length,
        active: activeConnections,
        idle: idleConnections,
        idleInTransaction: idleInTransactionConnections,
        internal: internalConnections,
        other: otherConnections,
        items: connectionItems,
      },
      users: databaseUsers,
      indexes: indexStats,
      tables: {
        totalRows,
        totalSizeBytes: totalTableBytes,
        totalSizePretty: this.formatBytes(totalTableBytes),
        totalIndexes: runtime?.totalIndexes ?? indexStats.length,
        items: tableStats,
        topQueried: topQueriedTables,
      },
      backup: {
        format: 'application/x-tar',
        fileExtension: '.tar',
        provider: providerLabel,
      },
    };
  }

  private async hasBackupScheduleSchemaColumn() {
    if (this.backupScheduleSchemaColumnExists !== null) {
      return this.backupScheduleSchemaColumnExists;
    }

    const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'management'
          AND table_name = 'database_backup_schedule'
          AND column_name = 'schemaName'
      ) AS "exists"
    `;

    this.backupScheduleSchemaColumnExists = rows[0]?.exists === true;
    return this.backupScheduleSchemaColumnExists;
  }

  private getTypedScheduleRow(rows: unknown[]): BackupScheduleRow | null {
    if (rows.length === 0) {
      return null;
    }

    const candidate = rows[0];
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }

    const row = candidate as Partial<BackupScheduleRow>;
    if (
      typeof row.id !== 'number' ||
      typeof row.isEnabled !== 'boolean' ||
      typeof row.runAtTime !== 'string'
    ) {
      return null;
    }

    return row as BackupScheduleRow;
  }

  private toUnknownArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private mapBackupRecordSummary(item: BackupRecordRow): BackupRecordSummary {
    return {
      id: item.id,
      fileName: item.fileName,
      origin: item.origin,
      sizeBytes: this.toSafeNumber(item.sizeBytes),
      createdAt:
        item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : new Date(item.createdAt).toISOString(),
    };
  }

  private parseOptionalDate(value: Date | string | null | undefined) {
    if (!value) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private toSafeNumber(value: bigint | number | string | undefined) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'bigint') {
      return Number(value);
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private formatBytes(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
  }
}
