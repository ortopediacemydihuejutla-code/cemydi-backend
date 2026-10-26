import { IsString, MaxLength, MinLength } from 'class-validator';

export class MobileGoogleDto {
  @IsString()
  @MinLength(100)
  @MaxLength(8192)
  idToken: string;
}
