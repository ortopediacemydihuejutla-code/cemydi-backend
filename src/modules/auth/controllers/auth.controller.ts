import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Rol } from '@prisma/client';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../services/auth.service';
import { AuthConfigService } from '../services/auth-config.service';
import type { AuthUser } from '../types/auth-user.interface';
import {
  AUTH_ACCESS_COOKIE,
  AUTH_EMAIL_VERIFICATION_SEND_THROTTLE,
  AUTH_LOGIN_THROTTLE,
  AUTH_PASSWORD_RESET_CONFIRM_THROTTLE,
  AUTH_PASSWORD_RESET_REQUEST_THROTTLE,
  AUTH_PASSWORD_RESET_VERIFY_CODE_THROTTLE,
  AUTH_REFRESH_COOKIE,
  AUTH_REFRESH_THROTTLE,
  AUTH_REGISTER_THROTTLE,
} from '../constants';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { RegisterDto } from '../dto/register.dto';
import { ConfirmEmailVerificationDto } from '../dto/confirm-email-verification.dto';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { EmailActionDto } from '../dto/email-action.dto';
import { LoginDto } from '../dto/login.dto';
import { RequestPasswordResetDto } from '../dto/request-password-reset.dto';
import { VerifyPasswordResetCodeDto } from '../dto/verify-password-reset-code.dto';
import { SkipCsrf } from '../decorators/skip-csrf.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const AUTH_GOOGLE_STATE_COOKIE = 'cemydi_google_oauth_state';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authConfigService: AuthConfigService,
  ) {}

  private extractAccessToken(req: Request): string | null {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const fromCookie = cookies?.[AUTH_ACCESS_COOKIE];
    if (typeof fromCookie === 'string' && fromCookie.trim()) {
      return fromCookie.trim();
    }

    const authorizationHeader = req.headers.authorization;
    if (typeof authorizationHeader !== 'string') {
      return null;
    }

    const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
      return null;
    }

    return token.trim() || null;
  }

  private extractRefreshToken(req: Request): string | null {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const fromCookie = cookies?.[AUTH_REFRESH_COOKIE];
    if (typeof fromCookie === 'string' && fromCookie.trim()) {
      return fromCookie.trim();
    }

    return null;
  }

  private setAuthCookies(
    req: Request,
    res: Response,
    result: {
      accessToken: string;
      refreshToken: string;
      accessCookieMaxAgeMs: number;
      refreshCookieMaxAgeMs: number;
    },
  ) {
    res.cookie(
      AUTH_ACCESS_COOKIE,
      result.accessToken,
      this.authConfigService.buildAuthCookieSetOptions(
        result.accessCookieMaxAgeMs,
        req,
      ),
    );
    res.cookie(
      AUTH_REFRESH_COOKIE,
      result.refreshToken,
      this.authConfigService.buildAuthCookieSetOptions(
        result.refreshCookieMaxAgeMs,
        req,
      ),
    );
    this.authConfigService.setCsrfCookie(
      res,
      req,
      result.refreshCookieMaxAgeMs,
    );
  }

  private clearAuthCookies(req: Request, res: Response) {
    const clearOptions =
      this.authConfigService.buildAuthCookieClearOptions(req);
    res.clearCookie(AUTH_ACCESS_COOKIE, clearOptions);
    res.clearCookie(AUTH_REFRESH_COOKIE, clearOptions);
    this.authConfigService.clearCsrfCookie(res, req);
  }

  private setGoogleStateCookie(req: Request, res: Response, state: string) {
    res.cookie(
      AUTH_GOOGLE_STATE_COOKIE,
      state,
      this.authConfigService.buildAuthCookieSetOptions(10 * 60 * 1000, req),
    );
  }

  private clearGoogleStateCookie(req: Request, res: Response) {
    res.clearCookie(
      AUTH_GOOGLE_STATE_COOKIE,
      this.authConfigService.buildAuthCookieClearOptions(req),
    );
  }

  @Post('register')
  @SkipCsrf()
  @Throttle(AUTH_REGISTER_THROTTLE)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @SkipCsrf()
  @Throttle(AUTH_LOGIN_THROTTLE)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setAuthCookies(req, res, result);
    return { user: result.user };
  }

  @Get('google')
  @SkipCsrf()
  @Throttle(AUTH_LOGIN_THROTTLE)
  startGoogleLogin(@Req() req: Request, @Res() res: Response) {
    const state = randomUUID();
    this.setGoogleStateCookie(req, res, state);
    return res.redirect(302, this.authService.buildGoogleAuthorizationUrl(state));
  }

  @Get('google/callback')
  @SkipCsrf()
  @Throttle(AUTH_LOGIN_THROTTLE)
  async handleGoogleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') googleError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const expectedState = cookies?.[AUTH_GOOGLE_STATE_COOKIE];
    this.clearGoogleStateCookie(req, res);

    const loginErrorUrl = (reason = 'google') =>
      this.authConfigService.buildFrontendLoginUrl({ googleError: reason });

    if (googleError) {
      return res.redirect(302, loginErrorUrl());
    }

    if (
      typeof expectedState !== 'string' ||
      !expectedState ||
      !state ||
      expectedState !== state
    ) {
      return res.redirect(302, loginErrorUrl());
    }

    if (!code?.trim()) {
      throw new BadRequestException('Codigo de Google requerido');
    }

    try {
      const result = await this.authService.loginWithGoogleCode(code);
      this.setAuthCookies(req, res, result);
      return res.redirect(
        302,
        new URL(
          result.user.rol === Rol.ADMIN ? '/admin' : '/perfil',
          this.authConfigService.frontendUrl,
        ).toString(),
      );
    } catch (error) {
      const reason =
        error instanceof UnauthorizedException &&
        error.message.toLowerCase().includes('inactiva')
          ? 'inactive'
          : 'google';
      return res.redirect(302, loginErrorUrl(reason));
    }
  }

  @Post('refresh')
  @SkipCsrf()
  @Throttle(AUTH_REFRESH_THROTTLE)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.extractRefreshToken(req);
    if (!refreshToken) {
      this.clearAuthCookies(req, res);
      throw new UnauthorizedException('Sesion invalida');
    }

    try {
      const result = await this.authService.refresh(refreshToken);
      this.setAuthCookies(req, res, result);
      return { user: result.user };
    } catch {
      this.clearAuthCookies(req, res);
      throw new UnauthorizedException('Sesion invalida');
    }
  }

  @Post('email-verification/send')
  @SkipCsrf()
  @Throttle(AUTH_EMAIL_VERIFICATION_SEND_THROTTLE)
  resendEmailVerification(@Body() dto: EmailActionDto) {
    return this.authService.resendEmailVerification(dto);
  }

  @Get('csrf')
  @UseGuards(JwtAuthGuard)
  issueCsrfToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshMaxAgeMs =
      this.authConfigService.refreshExpiresDays * 24 * 60 * 60 * 1000;
    this.authConfigService.setCsrfCookie(res, req, refreshMaxAgeMs);
    return { message: 'Token CSRF emitido' };
  }

  @Post('email-verification/confirm')
  @SkipCsrf()
  @Throttle(AUTH_EMAIL_VERIFICATION_SEND_THROTTLE)
  confirmEmailVerification(@Body() dto: ConfirmEmailVerificationDto) {
    return this.authService.confirmEmailVerification(dto.token);
  }

  /**
   * Legacy: correos antiguos apuntaban al backend. Redirige al frontend unificado.
   */
  @Get('email-verification/confirm')
  @SkipCsrf()
  legacyConfirmEmailVerificationRedirect(
    @Query() dto: ConfirmEmailVerificationDto,
    @Res() res: Response,
  ) {
    const url = new URL('/verify-email', this.authConfigService.frontendUrl);
    url.searchParams.set('token', dto.token);
    return res.redirect(302, url.toString());
  }

  @Post('password-reset/request')
  @SkipCsrf()
  @Throttle(AUTH_PASSWORD_RESET_REQUEST_THROTTLE)
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('password-reset/verify-code')
  @SkipCsrf()
  @Throttle(AUTH_PASSWORD_RESET_VERIFY_CODE_THROTTLE)
  verifyPasswordResetCode(@Body() dto: VerifyPasswordResetCodeDto) {
    return this.authService.verifyPasswordResetCode(dto);
  }

  @Post('password-reset/confirm')
  @SkipCsrf()
  @Throttle(AUTH_PASSWORD_RESET_CONFIRM_THROTTLE)
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const accessToken = this.extractAccessToken(req);
    const refreshToken = this.extractRefreshToken(req);
    this.clearAuthCookies(req, res);
    await this.authService.tryLogoutWithToken(accessToken);
    await this.authService.tryLogoutWithRefreshToken(refreshToken);
    return {
      message: 'Sesion cerrada correctamente',
    };
  }

  @Get('security-overview')
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  getSecurityOverview(@CurrentUser() user: AuthUser) {
    return this.authService.getSecurityOverview(user);
  }
}
