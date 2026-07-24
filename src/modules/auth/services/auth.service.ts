import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../types/auth-user.interface';
import { AuthEmailVerificationService } from './auth-email-verification.service';
import { AuthGoogleService } from './auth-google.service';
import { AuthLoginService } from './auth-login.service';
import { AuthPasswordResetService } from './auth-password-reset.service';
import { AuthSecurityOverviewService } from './auth-security-overview.service';
import { AuthSessionService } from './auth-session.service';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { ConfirmPasswordResetTokenDto } from '../dto/confirm-password-reset-token.dto';
import { ConfirmEmailVerificationCodeDto } from '../dto/confirm-email-verification-code.dto';
import { EmailActionDto } from '../dto/email-action.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { RequestPasswordResetDto } from '../dto/request-password-reset.dto';
import { VerifyPasswordResetCodeDto } from '../dto/verify-password-reset-code.dto';
import { VerifyPasswordResetTokenDto } from '../dto/verify-password-reset-token.dto';
import type { SessionAuthResult } from '../types/auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly authLoginService: AuthLoginService,
    private readonly authGoogleService: AuthGoogleService,
    private readonly authSessionService: AuthSessionService,
    private readonly authEmailVerificationService: AuthEmailVerificationService,
    private readonly authPasswordResetService: AuthPasswordResetService,
    private readonly authSecurityOverviewService: AuthSecurityOverviewService,
  ) {}

  register(dto: RegisterDto) {
    return this.authLoginService.register(dto);
  }

  login(dto: LoginDto) {
    return this.authLoginService.login(dto);
  }

  buildGoogleAuthorizationUrl(state: string) {
    return this.authGoogleService.buildGoogleAuthorizationUrl(state);
  }

  loginWithGoogleCode(code: string): Promise<SessionAuthResult> {
    return this.authGoogleService.loginWithAuthorizationCode(code);
  }

  refresh(refreshTokenRaw: string): Promise<SessionAuthResult> {
    return this.authSessionService.refresh(refreshTokenRaw);
  }

  resendEmailVerification(dto: EmailActionDto) {
    return this.authEmailVerificationService.resendEmailVerification(dto);
  }

  confirmEmailVerification(token: string) {
    return this.authEmailVerificationService.confirmEmailVerification(token);
  }

  confirmEmailVerificationCode(dto: ConfirmEmailVerificationCodeDto) {
    return this.authEmailVerificationService.confirmEmailVerificationCode(dto);
  }

  requestPasswordReset(dto: RequestPasswordResetDto) {
    return this.authPasswordResetService.requestPasswordReset(dto);
  }

  verifyPasswordResetCode(dto: VerifyPasswordResetCodeDto) {
    return this.authPasswordResetService.verifyPasswordResetCode(dto);
  }

  verifyPasswordResetToken(dto: VerifyPasswordResetTokenDto) {
    return this.authPasswordResetService.verifyPasswordResetToken(dto.token);
  }

  confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    return this.authPasswordResetService.confirmPasswordReset(dto);
  }

  confirmPasswordResetToken(dto: ConfirmPasswordResetTokenDto) {
    return this.authPasswordResetService.confirmPasswordResetToken(dto);
  }

  tryLogoutWithToken(token: string | null | undefined): Promise<void> {
    return this.authSessionService.tryLogoutWithToken(token);
  }

  tryLogoutWithRefreshToken(
    refreshToken: string | null | undefined,
  ): Promise<void> {
    return this.authSessionService.tryLogoutWithRefreshToken(refreshToken);
  }

  logout(user: AuthUser) {
    return this.authSessionService.logout(user);
  }

  revokeUserSessions(
    userId: number,
    options?: {
      excludeSid?: string;
      sessionId?: string;
    },
  ) {
    return this.authSessionService.revokeUserSessions(userId, options);
  }

  revokeAllUserSessionsAsAdmin(userId: number) {
    return this.authSessionService.revokeAllUserSessionsAsAdmin(userId);
  }

  revokeSingleUserSessionAsAdmin(userId: number, sessionId: string) {
    return this.authSessionService.revokeSingleUserSessionAsAdmin(
      userId,
      sessionId,
    );
  }

  getSecurityOverview(user: AuthUser) {
    return this.authSecurityOverviewService.getSecurityOverview(user);
  }
}
