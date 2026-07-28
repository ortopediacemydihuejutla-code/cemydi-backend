import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { Rol } from '@prisma/client';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminNotificationsService } from './admin-notifications.service';
import { AdminActivityQueryDto } from './dto/admin-activity-query.dto';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';

@Controller('admin/notifications')
@Roles(Rol.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminNotificationsController {
  constructor(
    private readonly adminNotificationsService: AdminNotificationsService,
  ) {}

  @Get()
  listCurrent(
    @CurrentUser() user: AuthUser,
    @Query() query: AdminActivityQueryDto,
  ) {
    return this.adminNotificationsService.listCurrent(user.id, query.limit);
  }

  @Patch('read')
  markAsRead(
    @CurrentUser() user: AuthUser,
    @Body() dto: MarkNotificationsReadDto,
  ) {
    return this.adminNotificationsService.markAsRead(user.id, dto.ids);
  }
}
