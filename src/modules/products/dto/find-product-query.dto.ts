import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

function transformIncludeInactive(value: unknown) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

export class FindProductQueryDto {
  @IsOptional()
  @Transform(({ value }) => transformIncludeInactive(value))
  @IsBoolean()
  includeInactive = false;
}
