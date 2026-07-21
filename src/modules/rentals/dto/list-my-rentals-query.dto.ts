import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum MyRentalFilter {
  ALL = 'ALL',
  PENDING = 'PENDING',
  DOCUMENTATION_PENDING = 'DOCUMENTATION_PENDING',
  APPROVED = 'APPROVED',
  DELIVERED = 'DELIVERED',
  DUE_SOON = 'DUE_SOON',
  RETURNED = 'RETURNED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

function optionalTrimmed(value: unknown) {
  if (typeof value !== 'string') return undefined;
  return value.trim() || undefined;
}

function optionalInteger(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  return Number(value);
}

export class ListMyRentalsQueryDto {
  @IsOptional()
  @IsEnum(MyRentalFilter)
  status?: MyRentalFilter;

  @IsOptional()
  @Transform(({ value }) => optionalTrimmed(value))
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(1)
  @Max(30)
  pageSize?: number;
}
