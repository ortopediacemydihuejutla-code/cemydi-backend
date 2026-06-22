import { IsEmail, IsNotEmpty } from 'class-validator';
import { PasswordPolicy } from './password-policy.decorators';
import { PasswordResetCode } from './password-reset-code.decorators';

export class ConfirmPasswordResetDto {
  @IsEmail()
  @IsNotEmpty()
  correo: string;

  @PasswordResetCode()
  codigo: string;

  @PasswordPolicy()
  newPassword: string;
}
