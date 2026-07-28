import {
  IsDateString,
  IsEnum,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PromotionImageStrategyInput {
  AUTO = 'AUTO',
  CUSTOM = 'CUSTOM',
}

export class CreatePromotionDto {
  @IsString()
  @MaxLength(4000)
  productIds!: string;

  @IsInt()
  @Min(1)
  @Max(90)
  @Type(() => Number)
  discountPercent!: number;

  @IsEnum(PromotionImageStrategyInput)
  imageStrategy!: PromotionImageStrategyInput;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(240)
  descripcion!: string;
}
