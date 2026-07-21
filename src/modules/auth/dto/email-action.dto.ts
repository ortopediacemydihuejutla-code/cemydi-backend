import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class EmailActionDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  correo: string;
}
