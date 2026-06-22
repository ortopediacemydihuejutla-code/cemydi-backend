export type BackupOrigin = 'MANUAL' | 'AUTOMATIC' | 'TABLE';

export type GoogleDriveProvider = 'service-account' | 'oauth2';

export type BackupRecordSummary = {
  id: number;
  fileName: string;
  origin: BackupOrigin;
  sizeBytes: number;
  createdAt: string;
};

export type BackupRecordWithLog = {
  backup: BackupRecordSummary;
  logText: string;
};

export type BackupRecordRow = {
  id: number;
  fileName: string;
  origin: BackupOrigin;
  sizeBytes: number | bigint | string;
  createdAt: Date | string;
};

export type BackupScheduleSummary = {
  enabled: boolean;
  everyDays: number;
  runAtTime: string;
  retentionDays: number;
  schemaName: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BackupScheduleRow = {
  id: number;
  isEnabled: boolean;
  intervalDays: number | bigint | string;
  runAtTime: string;
  retentionDays: number | bigint | string;
  schemaName: string | null;
  lastRunAt: Date | string | null;
  nextRunAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type PersistBackupScheduleRowInput = {
  id: number;
  isEnabled: boolean;
  intervalDays: number;
  runAtTime: string;
  retentionDays: number;
  schemaName: string | null;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BackupSchedulePayload = {
  enabled: boolean;
  everyDays: number;
  runAtTime: string;
  retentionDays: number;
  schemaName: string | null;
};

export type BackupPayload = {
  fileName: string;
  sizeBytes: number;
  createdAt: Date;
  verboseLog: string;
};

export type PgDumpResult = {
  content: Buffer;
  verboseLog: string;
};
