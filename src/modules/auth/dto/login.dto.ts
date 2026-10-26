import { IsEmail, IsNotEmpty, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  correo: string;

  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
