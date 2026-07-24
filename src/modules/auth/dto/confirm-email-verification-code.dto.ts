import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';
import { PasswordResetCode } from './password-reset-code.decorators';

export class ConfirmEmailVerificationCodeDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  correo: string;

  @PasswordResetCode()
  codigo: string;
}
