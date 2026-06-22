import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MaintenanceUseCasesService } from './application/use-cases/maintenance-use-cases.service';
import { MaintenanceSchedulerService } from './infrastructure/scheduler/maintenance-scheduler.service';

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly maintenanceUseCasesService: MaintenanceUseCasesService,
    private readonly maintenanceSchedulerService: MaintenanceSchedulerService,
  ) {}

  onModuleInit() {
    this.maintenanceSchedulerService.start();
  }

  onModuleDestroy() {
    this.maintenanceSchedulerService.stop();
  }

  async run(payload: Record<string, unknown>) {
    return this.maintenanceUseCasesService.run(payload);
  }

  async getSchedule() {
    return this.maintenanceUseCasesService.getSchedule();
  }

  async updateSchedule(payload: Record<string, unknown>) {
    return this.maintenanceUseCasesService.updateSchedule(payload);
  }

  async deleteSchedule() {
    return this.maintenanceUseCasesService.deleteSchedule();
  }
}
