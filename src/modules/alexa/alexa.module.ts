import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AlexaController } from './alexa.controller';
import { AlexaService } from './alexa.service';

@Module({
  imports: [PrismaModule],
  controllers: [AlexaController],
  providers: [AlexaService],
})
export class AlexaModule {}
