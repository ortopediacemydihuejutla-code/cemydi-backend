import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  @Max(25)
  quantity!: number;

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
