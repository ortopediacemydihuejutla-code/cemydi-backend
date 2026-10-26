import { IsString, Matches } from 'class-validator';

export class MobileRefreshDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  refreshToken: string;
}
