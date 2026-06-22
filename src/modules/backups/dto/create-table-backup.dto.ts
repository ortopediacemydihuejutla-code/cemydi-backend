import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateTableBackupDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  tableName!: string;
}
