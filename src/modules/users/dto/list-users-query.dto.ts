import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

function transformOptionalInteger(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Number(value);
}

export class ListUsersQueryDto {
  @IsOptional()
  @Transform(({ value }) => transformOptionalInteger(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => transformOptionalInteger(value))
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
