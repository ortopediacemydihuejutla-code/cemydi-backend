import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

export class MarkNotificationsReadDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  ids!: string[];
}
