import {
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Rol } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from './users.service';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN)
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post(':userId/sessions/revoke')
  revokeAllSessions(@Param('userId', ParseIntPipe) userId: number) {
    return this.usersService.revokeAllSessionsAsAdmin(userId);
  }

  @Post(':userId/sessions/:sessionId/revoke')
  revokeSingleSession(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('sessionId') sessionId: string,
  ) {
    return this.usersService.revokeSingleSessionAsAdmin(userId, sessionId);
  }
}
