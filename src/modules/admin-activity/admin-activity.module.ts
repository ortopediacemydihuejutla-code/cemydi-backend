import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminActivityController } from './admin-activity.controller';
import { AdminActivityService } from './admin-activity.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminActivityController],
  providers: [AdminActivityService],
})
export class AdminActivityModule {}
