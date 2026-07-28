import { IsString, Matches } from 'class-validator';

export class ApplyCouponDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{4,24}$/)
  code!: string;
}
