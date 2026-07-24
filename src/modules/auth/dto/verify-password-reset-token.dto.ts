import { AuthLinkToken } from './auth-link-token.decorators';

export class VerifyPasswordResetTokenDto {
  @AuthLinkToken()
  token: string;
}
