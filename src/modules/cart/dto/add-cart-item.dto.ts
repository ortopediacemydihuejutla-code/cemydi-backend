import { CartItemMode } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AddCartItemDto {
  @IsInt()
  @Min(1)
  productId!: number;

  @IsInt()
  @Min(1)
  @Max(25)
  quantity!: number;

  @IsOptional()
  @IsEnum(CartItemMode)
  mode?: CartItemMode;

  @IsOptional()
  @IsDateString()
  rentalStartDate?: string;

  @IsOptional()
  @IsDateString()
  rentalEndDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rentalNotes?: string;
}
