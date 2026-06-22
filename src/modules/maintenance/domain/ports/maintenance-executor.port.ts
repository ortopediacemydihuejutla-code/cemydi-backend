import {
  MaintenanceOperation,
  PsqlExecutionResult,
} from '../../dto/maintenance.types';

export abstract class MaintenanceExecutorPort {
  abstract runPsqlCommand(
    operation: MaintenanceOperation,
    tableName: string,
  ): Promise<PsqlExecutionResult>;
}
