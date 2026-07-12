import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Rol } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MaintenanceService } from './maintenance.service';
import { RunMaintenanceDto } from './dto/run-maintenance.dto';
import { UpdateMaintenanceScheduleDto } from './dto/update-maintenance-schedule.dto';

@Controller('maintenance')
@Roles(Rol.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get('schedule')
  async getSchedule() {
    const schedule = await this.maintenanceService.getSchedule();
    return { schedule };
  }

  @Put('schedule')
  async updateSchedule(@Body() body: UpdateMaintenanceScheduleDto) {
    const schedule = await this.maintenanceService.updateSchedule({ ...body });
    return {
      schedule,
      message:
        'Programacion automatica de mantenimiento actualizada correctamente',
    };
  }

  @Delete('schedule')
  async deleteSchedule() {
    const schedule = await this.maintenanceService.deleteSchedule();
    return {
      schedule,
      message:
        'Programacion automatica de mantenimiento eliminada correctamente',
    };
  }

  @Post('run')
  @Throttle({ default: { limit: 2, ttl: 300_000 } })
  async runMaintenance(@Body() body: RunMaintenanceDto) {
    const result = await this.maintenanceService.run({ ...body });
    return result;
  }
}
