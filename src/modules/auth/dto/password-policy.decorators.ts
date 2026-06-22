import { applyDecorators } from '@nestjs/common';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import { PasswordPolicyConstraint } from './password-policy.constraint';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password-policy';

export function PasswordPolicy() {
  return applyDecorators(
    IsString(),
    IsNotEmpty(),
    MinLength(PASSWORD_MIN_LENGTH),
    MaxLength(PASSWORD_MAX_LENGTH),
    Validate(PasswordPolicyConstraint),
  );
}
