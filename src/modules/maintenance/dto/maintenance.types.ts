export type MaintenanceOperation = 'VACUUM' | 'ANALYZE' | 'VACUUM_ANALYZE';

export type MaintenanceRunResult = {
  operation: MaintenanceOperation;
  schemaName: string | null;
  tableName: string | null;
  processedTables: number;
  startedAt: string;
  finishedAt: string;
  logText: string;
  message: string;
};

export type MaintenanceScheduleSummary = {
  enabled: boolean;
  everyDays: number;
  runAtTime: string;
  operation: MaintenanceOperation;
  schemaName: string | null;
  tableName: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MaintenanceScheduleRow = {
  id: number;
  isEnabled: boolean;
  intervalDays: number | bigint | string;
  runAtTime: string;
  operation: MaintenanceOperation;
  schemaName: string | null;
  tableName: string | null;
  lastRunAt: Date | string | null;
  nextRunAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type PersistMaintenanceScheduleRowInput = {
  id: number;
  isEnabled: boolean;
  intervalDays: number;
  runAtTime: string;
  operation: MaintenanceOperation;
  schemaName: string | null;
  tableName: string | null;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MaintenanceSchedulePayload = {
  enabled: boolean;
  everyDays: number;
  runAtTime: string;
  operation: MaintenanceOperation;
  schemaName: string | null;
  tableName: string | null;
};

export type PsqlExecutionResult = {
  verboseLog: string;
};
