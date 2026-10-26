import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Rol } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user.interface';
import {
  NotificationAutomationDto,
  NotificationPreferencesDto,
  NotificationQueryDto,
  ReadNotificationDto,
  RecipientSearchDto,
  RegisterPushDto,
  SendNotificationDto,
  UnregisterPushDto,
  DestinationSearchDto,
} from './notification.dto';
import { NotificationsService } from './notifications.service';
import { PushDeliveryService } from './push-delivery.service';
import { NotificationNoStoreInterceptor } from './notification-no-store.interceptor';

@Controller('notifications')
@UseInterceptors(NotificationNoStoreInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.CLIENT)
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly push: PushDeliveryService,
  ) {}
  @Get() inbox(
    @CurrentUser() user: AuthUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.service.inbox(user.id, query);
  }
  @Patch('read') read(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReadNotificationDto,
  ) {
    return this.service.markRead(user.id, dto.ids);
  }
  @Patch('read-all') readAll(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.id);
  }
  @Get('preferences') preferences(@CurrentUser() user: AuthUser) {
    return this.service.preferences(user.id);
  }
  @Patch('preferences') savePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: NotificationPreferencesDto,
  ) {
    return this.service.savePreferences(user.id, dto);
  }
  @Get('push-config') config() {
    return this.push.webConfig();
  }
  @Post('subscriptions/register') register(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterPushDto,
  ) {
    return this.service.registerPush(user, dto);
  }
  @Post('subscriptions/unregister') unregister(
    @CurrentUser() user: AuthUser,
    @Body() dto: UnregisterPushDto,
  ) {
    return this.service.unregisterPush(user.id, dto.endpoint);
  }
  @Get('promotion/:id') promotion(@Param('id', ParseIntPipe) id: number) {
    return this.service.promotion(id);
  }
  @Get(':id') detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user.id, id);
  }
}

@Controller('admin/notification-campaigns')
@UseInterceptors(NotificationNoStoreInterceptor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMIN)
export class NotificationCampaignsController {
  constructor(private readonly service: NotificationsService) {}
  @Get() history(@Query() query: NotificationQueryDto) {
    return this.service.history(query);
  }
  @Get('recipients') recipients(@Query() query: RecipientSearchDto) {
    return this.service.recipients(query.search);
  }
  @Get('destinations') destinations(@Query() query: DestinationSearchDto) {
    return this.service.destinations(query);
  }
  @Post() send(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendNotificationDto,
  ) {
    return this.service.send(user.id, dto);
  }
  @Get('automation') automation() {
    return this.service.automation();
  }
  @Patch('automation') saveAutomation(@Body() dto: NotificationAutomationDto) {
    return this.service.saveAutomation(dto);
  }
}
