import { Transform } from 'class-transformer';
import { RentalRequestStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function transformOptionalTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function transformOptionalInteger(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Number(value);
}

export class ListRentalsAdminQueryDto {
  @IsOptional()
  @IsEnum(RentalRequestStatus)
  status?: RentalRequestStatus;

  @IsOptional()
  @Transform(({ value }) => transformOptionalTrimmedString(value))
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => transformOptionalInteger(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => transformOptionalInteger(value))
  @IsInt()
  @Min(1)
  @Max(60)
  pageSize?: number;
}
