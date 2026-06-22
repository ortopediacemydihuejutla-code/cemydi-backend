import { applyDecorators } from '@nestjs/common';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { PASSWORD_RESET_CODE_LENGTH } from '../utils/auth-crypto.util';

export function PasswordResetCode() {
  return applyDecorators(
    IsString(),
    IsNotEmpty(),
    Length(PASSWORD_RESET_CODE_LENGTH, PASSWORD_RESET_CODE_LENGTH),
    Matches(/^\d+$/, {
      message: `El codigo debe tener ${PASSWORD_RESET_CODE_LENGTH} digitos numericos`,
    }),
  );
}
