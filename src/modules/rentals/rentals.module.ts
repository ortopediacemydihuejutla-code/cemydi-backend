import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RentalsController } from './rentals.controller';
import { RentalsService } from './rentals.service';

@Module({
  imports: [PrismaModule],
  controllers: [RentalsController],
  providers: [RentalsService],
})
export class RentalsModule {}
