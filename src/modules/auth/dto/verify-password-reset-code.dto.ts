import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';
import { PasswordResetCode } from './password-reset-code.decorators';

export class VerifyPasswordResetCodeDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  correo: string;

  @PasswordResetCode()
  codigo: string;
}
