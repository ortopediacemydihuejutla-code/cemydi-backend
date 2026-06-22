import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { transformStringArray } from '../../products/dto/product-dto.helpers';

export class UpdateAboutPageDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(90)
  heroTitle?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(320)
  heroSubtitle?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  missionTitle?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(900)
  missionText?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  visionTitle?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(900)
  visionText?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  valuesTitle?: string;

  @IsOptional()
  @Transform(transformStringArray)
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(40, { each: true })
  values?: string[];

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(90)
  storyTitle?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(1200)
  storyText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  heroImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  secondaryImageUrl?: string;
}
