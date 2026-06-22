import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

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

export class FindProductsQueryDto {
  @IsOptional()
  @Transform(({ value }) => transformOptionalTrimmedString(value))
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => transformCommaSeparatedStringArray(value))
  clasificaciones: string[] = [];

  @IsOptional()
  @Transform(({ value }) => transformCommaSeparatedStringArray(value))
  marcas: string[] = [];

  @IsOptional()
  @Transform(({ value }) => transformCommaSeparatedStringArray(value))
  tipos: string[] = [];

  @IsOptional()
  @Transform(({ value }) => transformOptionalTrimmedString(value))
  @IsString()
  requiereReceta?: string;

  @IsOptional()
  @Transform(({ value }) => transformOptionalTrimmedString(value))
  @IsString()
  page?: string;

  @IsOptional()
  @Transform(({ value }) => transformOptionalTrimmedString(value))
  @IsString()
  pageSize?: string;

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
