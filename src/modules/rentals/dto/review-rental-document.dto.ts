import { RentalDocumentStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewRentalDocumentDto {
  @IsIn([RentalDocumentStatus.APROBADO, RentalDocumentStatus.RECHAZADO])
  status!: RentalDocumentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
