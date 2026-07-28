import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PromotionImageStrategyInput } from './create-promotion.dto';

export class UpdatePromotionDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  productIds?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  @Type(() => Number)
  discountPercent?: number;

  @IsOptional()
  @IsEnum(PromotionImageStrategyInput)
  imageStrategy?: PromotionImageStrategyInput;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(240)
  descripcion?: string;
}
