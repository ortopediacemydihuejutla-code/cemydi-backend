import { IsEmail, IsNotEmpty } from 'class-validator';
import { PasswordResetCode } from './password-reset-code.decorators';

export class VerifyPasswordResetCodeDto {
  @IsEmail()
  @IsNotEmpty()
  correo: string;

  @PasswordResetCode()
  codigo: string;
}
