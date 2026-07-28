import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum CouponDiscountTypeInput {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

export class CreateCouponDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{4,24}$/)
  code!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(160)
  description!: string;

  @IsEnum(CouponDiscountTypeInput)
  discountType!: CouponDiscountTypeInput;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000)
  discountValue!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimumPurchase!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  maximumDiscount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsBoolean()
  active!: boolean;
}
