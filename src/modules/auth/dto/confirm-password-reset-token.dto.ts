import { AuthLinkToken } from './auth-link-token.decorators';
import { PasswordPolicy } from './password-policy.decorators';

export class ConfirmPasswordResetTokenDto {
  @AuthLinkToken()
  token: string;

  @PasswordPolicy()
  newPassword: string;
}
