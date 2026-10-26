import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import {
  NotificationsController,
  NotificationCampaignsController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushDeliveryService } from './push-delivery.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController, NotificationCampaignsController],
  providers: [NotificationsService, PushDeliveryService],
})
export class NotificationsModule {}
