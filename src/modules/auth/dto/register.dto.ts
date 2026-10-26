import { IsEmail, IsNotEmpty, MaxLength, MinLength } from 'class-validator';
import { PasswordPolicy } from './password-policy.decorators';

export class RegisterDto {
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  nombre: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  correo: string;

  @PasswordPolicy()
  password: string;
}
