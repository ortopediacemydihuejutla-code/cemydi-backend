import {
  BackupOrigin,
  BackupRecordRow,
  BackupRecordSummary,
  BackupScheduleRow,
  PersistBackupScheduleRowInput,
} from '../../dto/backups.types';

export abstract class BackupRepositoryPort {
  abstract tableExists(tableName: string): Promise<boolean>;

  abstract ensureRequiredTable(
    tableName: string,
    message: string,
  ): Promise<void>;

  abstract listDatabaseBackupRecords(): Promise<BackupRecordSummary[]>;

  abstract findDatabaseBackupRecordById(
    id: number,
  ): Promise<BackupRecordRow | null>;

  abstract insertBackupRecord(backup: {
    fileName: string;
    origin: BackupOrigin;
    sizeBytes: number;
    createdAt: Date;
  }): Promise<BackupRecordSummary>;

  abstract deleteBackupRecordById(id: number): Promise<BackupRecordRow | null>;

  abstract restoreBackupRecord(record: BackupRecordRow): Promise<void>;

  abstract listBackupTableNames(): Promise<string[]>;

  abstract listBackupSchemaNames(): Promise<string[]>;

  abstract listExpiredAutomaticBackups(
    cutoffDate: Date,
  ): Promise<BackupRecordRow[]>;

  abstract getBackupScheduleRow(): Promise<BackupScheduleRow | null>;

  abstract upsertBackupScheduleRow(
    row: PersistBackupScheduleRowInput,
    overwriteExisting: boolean,
  ): Promise<BackupScheduleRow | null>;

  abstract updateScheduleExecutionDates(
    id: number,
    lastRunAt: Date | null,
    nextRunAt: Date | null,
  ): Promise<void>;

  abstract getDatabaseStatus(
    providerLabel: string,
  ): Promise<Record<string, unknown>>;
}
