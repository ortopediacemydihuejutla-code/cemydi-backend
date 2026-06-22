import {
  MaintenanceScheduleRow,
  PersistMaintenanceScheduleRowInput,
} from '../../dto/maintenance.types';

export abstract class MaintenanceRepositoryPort {
  abstract tableExists(tableName: string): Promise<boolean>;

  abstract ensureRequiredTable(
    tableName: string,
    message: string,
  ): Promise<void>;

  abstract listMaintenanceTableNames(
    schemaName?: string | null,
  ): Promise<string[]>;

  abstract getMaintenanceScheduleRow(): Promise<MaintenanceScheduleRow | null>;

  abstract upsertMaintenanceScheduleRow(
    row: PersistMaintenanceScheduleRowInput,
    overwriteExisting: boolean,
  ): Promise<MaintenanceScheduleRow | null>;

  abstract updateScheduleExecutionDates(
    id: number,
    lastRunAt: Date | null,
    nextRunAt: Date | null,
  ): Promise<void>;
}
