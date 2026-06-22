import { GoogleDriveProvider } from '../../dto/backups.types';

export abstract class BackupStoragePort {
  abstract getPrimaryProvider(): GoogleDriveProvider;

  abstract uploadBackup(fileName: string, content: Buffer): Promise<void>;

  abstract downloadBackup(fileName: string): Promise<Buffer>;

  abstract deleteBackup(fileName: string): Promise<void>;

  abstract shouldKeepDeletionLocal(error: unknown): boolean;
}
