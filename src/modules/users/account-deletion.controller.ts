import { Body, Controller, Get, Header, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AUTH_PASSWORD_RESET_CONFIRM_THROTTLE,
  AUTH_PASSWORD_RESET_REQUEST_THROTTLE,
} from '../auth/constants';
import type { AuthUser } from '../auth/types/auth-user.interface';
import {
  ConfirmAccountDeletionDto,
  RequestAccountDeletionDto,
} from './account-deletion.dto';
import { AccountDeletionService } from './account-deletion.service';

@Controller('account-deletion')
export class AccountDeletionController {
  constructor(private readonly deletion: AccountDeletionService) {}

  @Post('request')
  @SkipCsrf()
  @Header('Cache-Control', 'no-store')
  @Throttle(AUTH_PASSWORD_RESET_REQUEST_THROTTLE)
  request(@Body() dto: RequestAccountDeletionDto) {
    return this.deletion.request(dto.correo);
  }

  @Post('confirm')
  @SkipCsrf()
  @Header('Cache-Control', 'no-store')
  @Throttle(AUTH_PASSWORD_RESET_CONFIRM_THROTTLE)
  confirm(@Body() dto: ConfirmAccountDeletionDto) {
    return this.deletion.confirm(dto.correo, dto.codigo);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENT')
  @Header('Cache-Control', 'no-store')
  status(@CurrentUser() user: AuthUser) {
    return this.deletion.status(user.sub);
  }
}
