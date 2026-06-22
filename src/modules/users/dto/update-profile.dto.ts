import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PasswordPolicy } from '../../auth/dto/password-policy.decorators';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  correo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  direccion?: string;

  @IsOptional()
  @PasswordPolicy()
  password?: string;
}
