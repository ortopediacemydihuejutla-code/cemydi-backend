import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PasswordPolicy } from '../../auth/dto/password-policy.decorators';
import { PasswordResetCode } from '../../auth/dto/password-reset-code.decorators';

export class RequestEmailChangeDto {
  @IsEmail()
  @MaxLength(120)
  newEmail!: string;

  @IsString()
  @IsNotEmpty()
  currentPassword!: string;
}

export class ConfirmEmailChangeDto {
  @IsEmail()
  @MaxLength(120)
  newEmail!: string;

  @PasswordResetCode()
  codigo!: string;
}

export class RequestPasswordChangeDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;
}

export class ConfirmPasswordChangeDto {
  @PasswordResetCode()
  codigo!: string;

  @PasswordPolicy()
  newPassword!: string;
}
