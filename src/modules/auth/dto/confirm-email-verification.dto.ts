import { IsHexadecimal, IsNotEmpty, IsString, Length } from 'class-validator';

export class ConfirmEmailVerificationDto {
  @IsString()
  @IsNotEmpty()
  @Length(64, 64)
  @IsHexadecimal()
  token: string;
}
