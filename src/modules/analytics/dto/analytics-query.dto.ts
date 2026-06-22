import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class AnalyticsQueryDto {
  /**
   * Ventana móvil en días (1–366). Por defecto 30.
   */
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? 30 : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(366)
  days = 30;
}
