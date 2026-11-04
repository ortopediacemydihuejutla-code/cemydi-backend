import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminUsersController } from './admin-users.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AccountSecurityService } from './account-security.service';
import { SecurityNoticeDeliveryService } from './security-notice-delivery.service';
import { RentalsModule } from '../rentals/rentals.module';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionWorker } from './account-deletion-worker.service';

@Module({
  imports: [PrismaModule, AuthModule, RentalsModule],
  controllers: [
    UsersController,
    AdminUsersController,
    AccountDeletionController,
  ],
  providers: [
    UsersService,
    AccountSecurityService,
    SecurityNoticeDeliveryService,
    AccountDeletionService,
    AccountDeletionWorker,
  ],
})
export class UsersModule {}
