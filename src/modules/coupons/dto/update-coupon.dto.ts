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
import { CouponDiscountTypeInput } from './create-coupon.dto';

export class UpdateCouponDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{4,24}$/)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(160)
  description?: string;

  @IsOptional()
  @IsEnum(CouponDiscountTypeInput)
  discountType?: CouponDiscountTypeInput;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000)
  discountValue?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimumPurchase?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  maximumDiscount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
