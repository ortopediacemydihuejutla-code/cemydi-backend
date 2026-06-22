import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

function trimOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

export class RunMaintenanceDto {
  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  operation?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  schemaName?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  tableName?: string;
}
