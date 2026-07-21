import { RentalDepositStatus } from '@prisma/client';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateRentalDepositDto {
  @IsIn([
    RentalDepositStatus.RETURNED,
    RentalDepositStatus.RETAINED,
    RentalDepositStatus.PARTIALLY_RETAINED,
  ])
  status!: RentalDepositStatus;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  returnedAmount!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  retainedAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
