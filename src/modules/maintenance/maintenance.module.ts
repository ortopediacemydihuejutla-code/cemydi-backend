import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceUseCasesService } from './application/use-cases/maintenance-use-cases.service';
import { MaintenanceExecutorPort } from './domain/ports/maintenance-executor.port';
import { MaintenanceRepositoryPort } from './domain/ports/maintenance-repository.port';
import { MaintenanceLogService } from './domain/services/maintenance-log.service';
import { MaintenanceScheduleService } from './domain/services/maintenance-schedule.service';
import { PostgresMaintenanceExecutorAdapter } from './infrastructure/adapters/postgres-maintenance-executor.adapter';
import { PrismaMaintenanceRepository } from './infrastructure/repositories/prisma-maintenance.repository';
import { MaintenanceSchedulerService } from './infrastructure/scheduler/maintenance-scheduler.service';

@Module({
  imports: [PrismaModule],
  controllers: [MaintenanceController],
  providers: [
    MaintenanceService,
    MaintenanceUseCasesService,
    MaintenanceLogService,
    MaintenanceScheduleService,
    MaintenanceSchedulerService,
    {
      provide: MaintenanceExecutorPort,
      useClass: PostgresMaintenanceExecutorAdapter,
    },
    {
      provide: MaintenanceRepositoryPort,
      useClass: PrismaMaintenanceRepository,
    },
  ],
})
export class MaintenanceModule {}
