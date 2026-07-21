import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';
import { PasswordPolicy } from './password-policy.decorators';
import { PasswordResetCode } from './password-reset-code.decorators';

export class ConfirmPasswordResetDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  correo: string;

  @PasswordResetCode()
  codigo: string;

  @PasswordPolicy()
  newPassword: string;
}
