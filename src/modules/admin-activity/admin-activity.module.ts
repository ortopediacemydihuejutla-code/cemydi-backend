import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminActivityController } from './admin-activity.controller';
import { AdminActivityService } from './admin-activity.service';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminNotificationsService } from './admin-notifications.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminActivityController, AdminNotificationsController],
  providers: [AdminActivityService, AdminNotificationsService],
})
export class AdminActivityModule {}
