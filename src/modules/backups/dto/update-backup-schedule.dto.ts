import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

function trimOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function transformOptionalBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'si', 'yes'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }
  }

  return value;
}

export class UpdateBackupScheduleDto {
  @IsOptional()
  @Type(() => Boolean)
  @Transform(({ value }: { value: unknown }) => transformOptionalBoolean(value))
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  everyDays?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  runAtTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  retentionDays?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  schemaName?: string;
}
