import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BackupsUseCasesService } from './application/use-cases/backups-use-cases.service';
import { BackupsSchedulerService } from './infrastructure/scheduler/backups-scheduler.service';

@Injectable()
export class BackupsService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly backupsUseCasesService: BackupsUseCasesService,
    private readonly backupsSchedulerService: BackupsSchedulerService,
  ) {}

  onModuleInit() {
    this.backupsSchedulerService.start();
  }

  onModuleDestroy() {
    this.backupsSchedulerService.stop();
  }

  async createDatabaseBackupRecord() {
    return this.backupsUseCasesService.createDatabaseBackupRecord();
  }

  async createSingleSchemaBackupRecord(schemaName: string) {
    return this.backupsUseCasesService.createSingleSchemaBackupRecord(
      schemaName,
    );
  }

  async createSingleTableBackupRecord(tableName: string) {
    return this.backupsUseCasesService.createSingleTableBackupRecord(tableName);
  }

  async listDatabaseBackupRecords() {
    return this.backupsUseCasesService.listDatabaseBackupRecords();
  }

  async getDatabaseBackupSchedule() {
    return this.backupsUseCasesService.getDatabaseBackupSchedule();
  }

  async updateDatabaseBackupSchedule(payload: Record<string, unknown>) {
    return this.backupsUseCasesService.updateDatabaseBackupSchedule(payload);
  }

  async deleteDatabaseBackupSchedule() {
    return this.backupsUseCasesService.deleteDatabaseBackupSchedule();
  }

  async getDatabaseBackupRecord(id: number) {
    return this.backupsUseCasesService.getDatabaseBackupRecord(id);
  }

  async createDatabaseBackup() {
    return this.backupsUseCasesService.createDatabaseBackup();
  }

  async restoreDatabaseBackupRecord(id: number) {
    return this.backupsUseCasesService.restoreDatabaseBackupRecord(id);
  }

  async deleteDatabaseBackupRecord(id: number) {
    return this.backupsUseCasesService.deleteDatabaseBackupRecord(id);
  }

  async getDatabaseStatus() {
    return this.backupsUseCasesService.getDatabaseStatus();
  }
}
