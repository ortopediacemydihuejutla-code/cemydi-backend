import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const integerQuery = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;

export class ListProductReviewsQueryDto {
  @IsOptional()
  @Transform(integerQuery)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page?: number;

  @IsOptional()
  @Transform(integerQuery)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
