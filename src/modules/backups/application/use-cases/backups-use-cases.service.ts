import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BackupExecutorPort } from '../../domain/ports/backup-executor.port';
import { BackupRepositoryPort } from '../../domain/ports/backup-repository.port';
import { BackupStoragePort } from '../../domain/ports/backup-storage.port';
import { BackupLogService } from '../../domain/services/backup-log.service';
import { BackupScheduleService } from '../../domain/services/backup-schedule.service';
import {
  BackupOrigin,
  BackupPayload,
  BackupRecordRow,
  BackupRecordSummary,
  BackupRecordWithLog,
} from '../../dto/backups.types';

@Injectable()
export class BackupsUseCasesService {
  private readonly logger = new Logger(BackupsUseCasesService.name);

  constructor(
    @Inject(BackupRepositoryPort)
    private readonly repository: BackupRepositoryPort,
    @Inject(BackupStoragePort)
    private readonly storage: BackupStoragePort,
    @Inject(BackupExecutorPort)
    private readonly executor: BackupExecutorPort,
    private readonly backupLogService: BackupLogService,
    private readonly backupScheduleService: BackupScheduleService,
  ) {}

  async createDatabaseBackupRecord() {
    return this.createAndStoreDatabaseBackupRecord('MANUAL');
  }

  async createSingleSchemaBackupRecord(schemaName: string) {
    return this.createAndStoreSingleSchemaBackupRecord(schemaName, 'TABLE');
  }

  async createSingleTableBackupRecord(tableName: string) {
    return this.createAndStoreSingleTableBackupRecord(tableName, 'TABLE');
  }

  async listDatabaseBackupRecords() {
    if (!(await this.repository.tableExists('database_backups'))) {
      return [];
    }

    return this.repository.listDatabaseBackupRecords();
  }

  async getDatabaseBackupSchedule() {
    return this.backupScheduleService.getDatabaseBackupSchedule();
  }

  async updateDatabaseBackupSchedule(payload: Record<string, unknown>) {
    const summary =
      await this.backupScheduleService.updateDatabaseBackupSchedule(payload);
    await this.applyRetentionPolicy(summary.retentionDays);
    return summary;
  }

  async deleteDatabaseBackupSchedule() {
    const summary =
      await this.backupScheduleService.deleteDatabaseBackupSchedule();
    await this.applyRetentionPolicy(summary.retentionDays);
    return summary;
  }

  async getDatabaseBackupRecord(id: number) {
    await this.repository.ensureRequiredTable(
      'database_backups',
      'No se pudo consultar el respaldo porque la tabla database_backups no existe. Ejecuta las migraciones de Prisma.',
    );

    const record = await this.repository.findDatabaseBackupRecordById(id);
    if (!record) {
      throw new NotFoundException('Respaldo no encontrado');
    }

    return {
      ...this.mapBackupRecordSummary(record),
      content: await this.storage.downloadBackup(record.fileName),
    };
  }

  async createDatabaseBackup() {
    const backup = await this.buildDirectDatabaseBackupPayload();

    return {
      fileName: backup.fileName,
      content: backup.content,
    };
  }

  async restoreDatabaseBackupRecord(id: number) {
    const record = await this.getDatabaseBackupRecord(id);
    const logText = await this.executor.runPgRestore(record.content);
    return { logText };
  }

  async deleteDatabaseBackupRecord(id: number) {
    await this.repository.ensureRequiredTable(
      'database_backups',
      'No se pudo eliminar el respaldo porque la tabla database_backups no existe. Ejecuta las migraciones de Prisma.',
    );

    const existing = await this.repository.findDatabaseBackupRecordById(id);
    if (!existing) {
      throw new NotFoundException('Respaldo no encontrado');
    }

    const deleted = await this.deleteBackupRecordAssets(existing);
    return this.mapBackupRecordSummary(deleted);
  }

  async getDatabaseStatus() {
    return this.repository.getDatabaseStatus(
      `google-drive-${this.storage.getPrimaryProvider()}`,
    );
  }

  async createAutomaticDatabaseBackupRecord() {
    return this.createAndStoreDatabaseBackupRecord('AUTOMATIC', {
      applyRetention: true,
    });
  }

  async createAutomaticSchemaBackupRecord(schemaName: string) {
    return this.createAndStoreSingleSchemaBackupRecord(schemaName, 'AUTOMATIC');
  }

  async applyRetentionPolicy(retentionDaysOverride?: number | bigint | string) {
    if (!(await this.repository.tableExists('database_backups'))) {
      return 0;
    }

    const retentionDays =
      retentionDaysOverride !== undefined
        ? this.backupScheduleService.toSafeNumber(retentionDaysOverride)
        : this.backupScheduleService.toSafeNumber(
            (await this.backupScheduleService.getOrCreateBackupScheduleRow())
              .retentionDays,
          );

    if (retentionDays < 1) {
      return 0;
    }

    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );
    const expiredBackups =
      await this.repository.listExpiredAutomaticBackups(cutoffDate);

    let deletedCount = 0;

    for (const backup of expiredBackups) {
      try {
        await this.deleteBackupRecordAssets(backup);
        deletedCount += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error desconocido al aplicar retencion';
        this.logger.warn(
          `No se pudo eliminar el respaldo vencido ${backup.fileName}: ${message}`,
        );
      }
    }

    if (deletedCount > 0) {
      this.logger.log(
        `Se eliminaron ${deletedCount} respaldo(s) vencidos por retencion automatica`,
      );
    }

    return deletedCount;
  }

  private async createAndStoreDatabaseBackupRecord(
    origin: BackupOrigin,
    options?: { applyRetention?: boolean },
  ): Promise<BackupRecordWithLog> {
    const backup = await this.buildDatabaseBackupPayload();
    let record: BackupRecordSummary;

    try {
      await this.repository.ensureRequiredTable(
        'database_backups',
        'No se pudo guardar el respaldo porque la tabla database_backups no existe. Ejecuta las migraciones de Prisma.',
      );
      record = await this.repository.insertBackupRecord({
        ...backup,
        origin,
      });
    } catch (error) {
      await this.tryDeleteUploadedBackupSilently(backup.fileName);
      throw error;
    }

    if (options?.applyRetention) {
      await this.applyRetentionPolicy();
    }

    return {
      backup: record,
      logText: this.backupLogService.composeBackupExecutionLog({
        backupType: 'database',
        fileName: backup.fileName,
        sizeBytes: backup.sizeBytes,
        requestedAt: backup.createdAt,
        backupCreatedAt: record.createdAt,
        provider: this.storage.getPrimaryProvider(),
        verboseLog: backup.verboseLog,
        recordId: record.id,
      }),
    };
  }

  private async createAndStoreSingleSchemaBackupRecord(
    schemaName: string,
    origin: BackupOrigin,
  ): Promise<BackupRecordWithLog> {
    const backup = await this.buildSingleSchemaBackupPayload(schemaName);
    let record: BackupRecordSummary;

    try {
      await this.repository.ensureRequiredTable(
        'database_backups',
        'No se pudo guardar el respaldo porque la tabla database_backups no existe. Ejecuta las migraciones de Prisma.',
      );
      record = await this.repository.insertBackupRecord({
        ...backup,
        origin,
      });
    } catch (error) {
      await this.tryDeleteUploadedBackupSilently(backup.fileName);
      throw error;
    }

    return {
      backup: record,
      logText: this.backupLogService.composeBackupExecutionLog({
        backupType: 'schema',
        schemaName,
        fileName: backup.fileName,
        sizeBytes: backup.sizeBytes,
        requestedAt: backup.createdAt,
        backupCreatedAt: record.createdAt,
        provider: this.storage.getPrimaryProvider(),
        verboseLog: backup.verboseLog,
        recordId: record.id,
      }),
    };
  }

  private async createAndStoreSingleTableBackupRecord(
    tableName: string,
    origin: BackupOrigin,
  ): Promise<BackupRecordWithLog> {
    const backup = await this.buildSingleTableBackupPayload(tableName);
    let record: BackupRecordSummary;

    try {
      await this.repository.ensureRequiredTable(
        'database_backups',
        'No se pudo guardar el respaldo porque la tabla database_backups no existe. Ejecuta las migraciones de Prisma.',
      );
      record = await this.repository.insertBackupRecord({
        ...backup,
        origin,
      });
    } catch (error) {
      await this.tryDeleteUploadedBackupSilently(backup.fileName);
      throw error;
    }

    return {
      backup: record,
      logText: this.backupLogService.composeBackupExecutionLog({
        backupType: 'table',
        tableName,
        fileName: backup.fileName,
        sizeBytes: backup.sizeBytes,
        requestedAt: backup.createdAt,
        backupCreatedAt: record.createdAt,
        provider: this.storage.getPrimaryProvider(),
        verboseLog: backup.verboseLog,
        recordId: record.id,
      }),
    };
  }

  private async buildDatabaseBackupPayload(): Promise<BackupPayload> {
    const now = new Date();
    const fileName = this.createBackupFileName(now);
    const dump = await this.executor.runPgDump();
    await this.storage.uploadBackup(fileName, dump.content);

    return {
      fileName,
      sizeBytes: dump.content.length,
      createdAt: now,
      verboseLog: dump.verboseLog,
    };
  }

  private async buildSingleTableBackupPayload(
    rawTableName: string,
  ): Promise<BackupPayload> {
    const tableName =
      this.backupScheduleService.normalizeTableName(rawTableName);
    const availableTables = await this.repository.listBackupTableNames();

    if (!availableTables.includes(tableName)) {
      throw new NotFoundException('La tabla seleccionada no existe');
    }

    const now = new Date();
    const fileName = this.createTableBackupFileName(now, tableName);
    const dump = await this.executor.runPgDump({ tableName });
    await this.storage.uploadBackup(fileName, dump.content);

    return {
      fileName,
      sizeBytes: dump.content.length,
      createdAt: now,
      verboseLog: dump.verboseLog,
    };
  }

  private async buildSingleSchemaBackupPayload(
    rawSchemaName: string,
  ): Promise<BackupPayload> {
    const schemaName =
      this.backupScheduleService.normalizeSchemaName(rawSchemaName);
    const availableSchemas = await this.repository.listBackupSchemaNames();

    if (!availableSchemas.includes(schemaName)) {
      throw new NotFoundException('El esquema seleccionado no existe');
    }

    const now = new Date();
    const fileName = this.createSchemaBackupFileName(now, schemaName);
    const dump = await this.executor.runPgDump({ schemaName });
    await this.storage.uploadBackup(fileName, dump.content);

    return {
      fileName,
      sizeBytes: dump.content.length,
      createdAt: now,
      verboseLog: dump.verboseLog,
    };
  }

  private async buildDirectDatabaseBackupPayload() {
    const now = new Date();
    const dump = await this.executor.runPgDump();
    return {
      fileName: this.createBackupFileName(now),
      content: dump.content,
    };
  }

  private async deleteBackupRecordAssets(record: BackupRecordRow) {
    await this.repository.ensureRequiredTable(
      'database_backups',
      'No se pudo eliminar el respaldo porque la tabla database_backups no existe. Ejecuta las migraciones de Prisma.',
    );

    const deleted = await this.repository.deleteBackupRecordById(record.id);
    if (!deleted) {
      throw new NotFoundException('Respaldo no encontrado');
    }

    try {
      await this.storage.deleteBackup(deleted.fileName);
      return deleted;
    } catch (error) {
      if (this.storage.shouldKeepDeletionLocal(error)) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : 'Error desconocido al eliminar en Google Drive';
        this.logger.warn(
          `Se elimino solo el registro local del respaldo ${deleted.fileName} porque Google Drive no esta disponible o requiere reautenticacion: ${message}`,
        );
        return deleted;
      }

      await this.repository.restoreBackupRecord(deleted);
      throw error;
    }
  }

  private async tryDeleteUploadedBackupSilently(fileName: string) {
    try {
      await this.storage.deleteBackup(fileName);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido al revertir respaldo en Google Drive';
      this.logger.warn(
        `No se pudo revertir el archivo ${fileName} en Google Drive tras un error local: ${message}`,
      );
    }
  }

  private mapBackupRecordSummary(item: BackupRecordRow): BackupRecordSummary {
    return {
      id: item.id,
      fileName: item.fileName,
      origin: item.origin,
      sizeBytes: this.backupScheduleService.toSafeNumber(item.sizeBytes),
      createdAt:
        item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : new Date(item.createdAt).toISOString(),
    };
  }

  private createBackupFileName(date: Date) {
    const timestamp = this.createBackupTimestamp(date);
    return `cemydi_backup_${timestamp.date}_${timestamp.time}.tar`;
  }

  private createTableBackupFileName(date: Date, tableName: string) {
    const timestamp = this.createBackupTimestamp(date);
    const safeTableName = tableName.replace(/\./g, '_');
    return `cemydi_${safeTableName}_backup_${timestamp.date}_${timestamp.time}.tar`;
  }

  private createSchemaBackupFileName(date: Date, schemaName: string) {
    const timestamp = this.createBackupTimestamp(date);
    return `cemydi_${schemaName}_schema_backup_${timestamp.date}_${timestamp.time}.tar`;
  }

  private createBackupTimestamp(date: Date) {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    const millisecond = String(date.getMilliseconds()).padStart(3, '0');

    return {
      date: `${year}${month}${day}`,
      time: `${hour}${minute}${second}${millisecond}`,
    };
  }
}
