import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminNotificationsService } from './admin-notifications.service';
import { AdminActivityQueryDto } from './dto/admin-activity-query.dto';

@Controller('admin/notifications')
@Roles(Rol.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminNotificationsController {
  constructor(
    private readonly adminNotificationsService: AdminNotificationsService,
  ) {}

  @Get()
  listCurrent(@Query() query: AdminActivityQueryDto) {
    return this.adminNotificationsService.listCurrent(query.limit);
  }
}
