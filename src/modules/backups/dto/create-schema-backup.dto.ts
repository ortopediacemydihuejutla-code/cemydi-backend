import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateSchemaBackupDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  schemaName!: string;
}
