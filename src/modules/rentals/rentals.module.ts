import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RentalsController } from './rentals.controller';
import { RentalsService } from './rentals.service';
import { RentalDocumentUploadRateLimitService } from './rental-document-upload-rate-limit.service';
import { RentalDocumentsCleanupService } from './rental-documents-cleanup.service';
import { RentalDocumentsCloudinaryService } from './rental-documents-cloudinary.service';
import { RentalDocumentsService } from './rental-documents.service';

@Module({
  imports: [PrismaModule],
  controllers: [RentalsController],
  providers: [
    RentalsService,
    RentalDocumentsService,
    RentalDocumentsCloudinaryService,
    RentalDocumentUploadRateLimitService,
    RentalDocumentsCleanupService,
  ],
  exports: [RentalDocumentsService],
})
export class RentalsModule {}
