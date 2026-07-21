import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  correo: string;
}
