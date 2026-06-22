import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminActivityService } from './admin-activity.service';
import { AdminActivityQueryDto } from './dto/admin-activity-query.dto';

@Controller('admin/activity')
@Roles(Rol.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminActivityController {
  constructor(private readonly adminActivityService: AdminActivityService) {}

  @Get()
  listRecent(@Query() query: AdminActivityQueryDto) {
    return this.adminActivityService.listRecent(query.limit);
  }
}
