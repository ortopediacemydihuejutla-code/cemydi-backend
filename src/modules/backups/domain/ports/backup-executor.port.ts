import { PgDumpResult } from '../../dto/backups.types';

export abstract class BackupExecutorPort {
  abstract runPgDump(options?: {
    tableName?: string;
    schemaName?: string;
  }): Promise<PgDumpResult>;

  abstract runPgRestore(content: Buffer): Promise<string>;
}
