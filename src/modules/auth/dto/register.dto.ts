import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { PasswordPolicy } from './password-policy.decorators';

export class RegisterDto {
  @IsNotEmpty()
  @MinLength(3)
  nombre: string;

  @IsEmail()
  @IsNotEmpty()
  correo: string;

  @PasswordPolicy()
  password: string;
}
