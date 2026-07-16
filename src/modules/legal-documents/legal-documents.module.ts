import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LegalDocumentsController } from './legal-documents.controller';
import { LegalDocumentsService } from './legal-documents.service';

@Module({
  imports: [PrismaModule],
  controllers: [LegalDocumentsController],
  providers: [LegalDocumentsService],
})
export class LegalDocumentsModule {}
