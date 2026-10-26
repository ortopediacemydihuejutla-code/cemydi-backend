import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminUsersController } from './admin-users.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AccountSecurityService } from './account-security.service';
import { SecurityNoticeDeliveryService } from './security-notice-delivery.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UsersController, AdminUsersController],
  providers: [
    UsersService,
    AccountSecurityService,
    SecurityNoticeDeliveryService,
  ],
})
export class UsersModule {}
