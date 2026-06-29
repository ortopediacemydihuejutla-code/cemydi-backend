import { RentalRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListRentalsAdminQueryDto {
  @IsOptional()
  @IsEnum(RentalRequestStatus)
  status?: RentalRequestStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
