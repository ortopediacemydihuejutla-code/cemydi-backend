import { applyDecorators } from '@nestjs/common';
import { IsHexadecimal, IsNotEmpty, IsString, Length } from 'class-validator';

export const AUTH_LINK_TOKEN_LENGTH = 64;

export function AuthLinkToken() {
  return applyDecorators(
    IsString(),
    IsNotEmpty(),
    Length(AUTH_LINK_TOKEN_LENGTH, AUTH_LINK_TOKEN_LENGTH),
    IsHexadecimal(),
  );
}
