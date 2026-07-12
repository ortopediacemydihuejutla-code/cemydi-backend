import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function transformCommaSeparatedStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) =>
        typeof item === 'string' ? item.split(',') : [String(item)],
      )
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function transformOptionalTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function transformIncludeInactive(value: unknown) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

function transformOptionalInteger(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Number(value);
}

export class FindProductsQueryDto {
  @IsOptional()
  @Transform(({ value }) => transformOptionalTrimmedString(value))
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => transformCommaSeparatedStringArray(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  clasificaciones: string[] = [];

  @IsOptional()
  @Transform(({ value }) => transformCommaSeparatedStringArray(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  marcas: string[] = [];

  @IsOptional()
  @Transform(({ value }) => transformCommaSeparatedStringArray(value))
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  tipos: string[] = [];

  @IsOptional()
  @Transform(({ value }) => transformOptionalTrimmedString(value))
  @IsString()
  requiereReceta?: string;

  @IsOptional()
  @Transform(({ value }) => transformOptionalInteger(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => transformOptionalInteger(value))
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @Transform(({ value }) => transformIncludeInactive(value))
  @IsBoolean()
  includeInactive = false;

  @IsOptional()
  @Transform(({ value }) => transformIncludeInactive(value))
  @IsBoolean()
  soloDisponibles = false;

  @IsOptional()
  @Transform(({ value }) => transformOptionalTrimmedString(value))
  @IsString()
  @MaxLength(20)
  sort?: string;
}
