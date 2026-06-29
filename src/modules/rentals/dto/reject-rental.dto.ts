import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectRentalDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
