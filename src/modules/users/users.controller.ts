import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Rol } from '@prisma/client';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalSessionJwtAuthGuard } from '../auth/guards/optional-session-jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import {
  AUTH_PASSWORD_RESET_CONFIRM_THROTTLE,
  AUTH_PASSWORD_RESET_REQUEST_THROTTLE,
} from '../auth/constants';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { AccountSecurityService } from './account-security.service';
import {
  ConfirmEmailChangeDto,
  ConfirmPasswordChangeDto,
  RequestEmailChangeDto,
  RequestPasswordChangeDto,
} from './dto/account-security.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accountSecurity: AccountSecurityService,
  ) {}

  @Get('me')
  @UseGuards(OptionalSessionJwtAuthGuard)
  getMe(@CurrentUser() user?: AuthUser) {
    if (!user) {
      return { user: null };
    }

    return this.usersService.getMe(user);
  }

  @Get()
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll({
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post()
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(user, dto);
  }

  @Post('me/email-change/request')
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_PASSWORD_RESET_REQUEST_THROTTLE)
  requestEmailChange(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestEmailChangeDto,
  ) {
    return this.accountSecurity.requestEmailChange(user, dto);
  }

  @Post('me/email-change/resend')
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_PASSWORD_RESET_REQUEST_THROTTLE)
  resendEmailChange(@CurrentUser() user: AuthUser) {
    return this.accountSecurity.resendEmailChange(user);
  }

  @Post('me/email-change/confirm')
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_PASSWORD_RESET_CONFIRM_THROTTLE)
  confirmEmailChange(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    return this.accountSecurity.confirmEmailChange(user, dto);
  }

  @Post('me/password-change/request')
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_PASSWORD_RESET_REQUEST_THROTTLE)
  requestPasswordChange(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestPasswordChangeDto,
  ) {
    return this.accountSecurity.requestPasswordChange(user, dto);
  }

  @Post('me/password-change/resend')
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_PASSWORD_RESET_REQUEST_THROTTLE)
  resendPasswordChange(@CurrentUser() user: AuthUser) {
    return this.accountSecurity.resendPasswordChange(user);
  }

  @Post('me/password-change/confirm')
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_PASSWORD_RESET_CONFIRM_THROTTLE)
  confirmPasswordChange(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmPasswordChangeDto,
  ) {
    return this.accountSecurity.confirmPasswordChange(user, dto);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(user, id);
  }
}
