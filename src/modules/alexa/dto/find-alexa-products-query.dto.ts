import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

function toOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function toBooleanFlag(value: unknown) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

export class FindAlexaProductsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalString(value))
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalString(value))
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @Transform(({ value }) => toBooleanFlag(value))
  @IsBoolean()
  availableOnly = false;
}
