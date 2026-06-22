import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { BackupsUseCasesService } from './application/use-cases/backups-use-cases.service';
import { BackupRepositoryPort } from './domain/ports/backup-repository.port';
import { BackupStoragePort } from './domain/ports/backup-storage.port';
import { BackupExecutorPort } from './domain/ports/backup-executor.port';
import { BackupLogService } from './domain/services/backup-log.service';
import { BackupScheduleService } from './domain/services/backup-schedule.service';
import { GoogleDriveBackupStorageAdapter } from './infrastructure/adapters/google-drive-backup-storage.adapter';
import { PostgresBackupExecutorAdapter } from './infrastructure/adapters/postgres-backup-executor.adapter';
import { PrismaBackupRepository } from './infrastructure/repositories/prisma-backup.repository';
import { BackupsSchedulerService } from './infrastructure/scheduler/backups-scheduler.service';

@Module({
  imports: [PrismaModule],
  controllers: [BackupsController],
  providers: [
    BackupsService,
    BackupsUseCasesService,
    BackupLogService,
    BackupScheduleService,
    BackupsSchedulerService,
    {
      provide: BackupRepositoryPort,
      useClass: PrismaBackupRepository,
    },
    {
      provide: BackupStoragePort,
      useClass: GoogleDriveBackupStorageAdapter,
    },
    {
      provide: BackupExecutorPort,
      useClass: PostgresBackupExecutorAdapter,
    },
  ],
})
export class BackupsModule {}
