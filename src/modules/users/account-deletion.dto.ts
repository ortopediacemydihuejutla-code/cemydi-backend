import { IsEmail, MaxLength } from 'class-validator';
import { PasswordResetCode } from '../auth/dto/password-reset-code.decorators';

export class RequestAccountDeletionDto {
  @IsEmail()
  @MaxLength(120)
  correo!: string;
}

export class ConfirmAccountDeletionDto extends RequestAccountDeletionDto {
  @PasswordResetCode()
  codigo!: string;
}
