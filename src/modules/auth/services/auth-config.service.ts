import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import type { SignOptions } from 'jsonwebtoken';
import { AUTH_CSRF_COOKIE } from '../constants';

@Injectable()
export class AuthConfigService {
  constructor(private readonly configService: ConfigService) {}

  get jwtSecret() {
    const secret = this.configService.get<string>('JWT_SECRET')?.trim();
    if (!secret) {
      throw new Error(
        'JWT_SECRET es obligatorio. Defínelo en las variables de entorno.',
      );
    }

    if (secret.length < 32) {
      throw new Error(
        'JWT_SECRET debe tener al menos 32 caracteres y ser aleatorio.',
      );
    }

    return secret;
  }

  get jwtExpiresIn() {
    return this.jwtAccessExpiresIn;
  }

  get jwtAccessExpiresIn() {
    return (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN')?.trim() ||
      this.configService.get<string>('JWT_EXPIRES_IN')?.trim() ||
      '15m') as SignOptions['expiresIn'];
  }

  get refreshExpiresDays() {
    return Number(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_DAYS') ?? '7',
    );
  }

  get loginMaxFailedAttempts() {
    return Number(
      this.configService.get<string>('LOGIN_MAX_FAILED_ATTEMPTS') ?? '5',
    );
  }

  get loginLockoutMinutes() {
    return Number(
      this.configService.get<string>('LOGIN_LOCKOUT_MINUTES') ?? '15',
    );
  }

  get emailVerificationExpiresMinutes() {
    return Number(
      this.configService.get<string>('EMAIL_VERIFICATION_EXPIRES_MINUTES') ??
        '60',
    );
  }

  get passwordResetExpiresMinutes() {
    return Number(
      this.configService.get<string>('PASSWORD_RESET_EXPIRES_MINUTES') ?? '15',
    );
  }

  get passwordResetMaxAttempts() {
    return Number(
      this.configService.get<string>('PASSWORD_RESET_MAX_ATTEMPTS') ?? '5',
    );
  }

  get frontendUrl() {
    return (
      this.configService.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() ||
      'http://localhost:3000'
    );
  }

  get backendUrl() {
    return (
      this.configService.get<string>('BACKEND_PUBLIC_URL')?.trim() ||
      `http://localhost:${this.configService.get<string>('PORT')?.trim() || '4000'}`
    );
  }

  buildAuthCookieSetOptions(maxAgeMs: number, req?: Request): CookieOptions {
    return { ...this.authCookieBase(req), maxAge: maxAgeMs };
  }

  buildAuthCookieClearOptions(req?: Request): CookieOptions {
    return this.authCookieBase(req);
  }

  buildFrontendLoginUrl(params?: Record<string, string>) {
    const url = new URL('/login', this.frontendUrl);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  buildFrontendEmailVerificationUrl(token: string) {
    const url = new URL('/verify-email', this.frontendUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  /**
   * @deprecated Enlaces nuevos deben usar buildFrontendEmailVerificationUrl.
   * Conservado solo para compatibilidad con correos antiguos vía redirect legacy.
   */
  buildEmailVerificationConfirmUrl(token: string) {
    const url = new URL('/auth/email-verification/confirm', this.backendUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  generateCsrfToken() {
    return randomBytes(32).toString('hex');
  }

  isCsrfProtectionEnabled(req?: Request) {
    const cookieOptions = this.authCookieBase(req);
    return cookieOptions.secure === true && cookieOptions.sameSite === 'none';
  }

  buildCsrfCookieSetOptions(maxAgeMs: number, req?: Request): CookieOptions {
    const base = this.authCookieBase(req);
    return {
      httpOnly: false,
      secure: base.secure,
      sameSite: base.sameSite,
      path: base.path,
      maxAge: maxAgeMs,
    };
  }

  buildCsrfCookieClearOptions(req?: Request): CookieOptions {
    const base = this.authCookieBase(req);
    return {
      httpOnly: false,
      secure: base.secure,
      sameSite: base.sameSite,
      path: base.path,
    };
  }

  setCsrfCookie(res: Response, req: Request | undefined, maxAgeMs: number) {
    res.cookie(
      AUTH_CSRF_COOKIE,
      this.generateCsrfToken(),
      this.buildCsrfCookieSetOptions(maxAgeMs, req),
    );
  }

  clearCsrfCookie(res: Response, req?: Request) {
    res.clearCookie(AUTH_CSRF_COOKIE, this.buildCsrfCookieClearOptions(req));
  }

  private authCookieBase(
    req?: Request,
  ): Pick<CookieOptions, 'httpOnly' | 'secure' | 'sameSite' | 'path'> {
    const secureCookies = this.shouldUseSecureCookies(req);
    // Si el despliegue queda cross-origin con SameSite=None, aqui es donde debe
    // activarse una proteccion CSRF real (double-submit cookie o header dedicado).
    // Con SameSite=Lax/Strict en same-site, CsrfGuard permanece inactivo (ver docs/CSRF.md).

    return {
      httpOnly: true,
      secure: secureCookies,
      sameSite: secureCookies ? 'none' : 'lax',
      path: '/',
    };
  }

  private shouldUseSecureCookies(req?: Request) {
    const explicitSecure = this.parseBooleanEnv(
      this.configService.get<string>('AUTH_COOKIE_SECURE'),
    );
    if (explicitSecure !== null) {
      return explicitSecure;
    }

    if (this.isSecureRequest(req)) {
      return true;
    }

    const configuredOrigins = (
      this.configService.get<string>('CORS_ORIGIN') ?? ''
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (configuredOrigins.length === 0) {
      return false;
    }

    return configuredOrigins.some((origin) => {
      try {
        const parsed = new URL(origin);
        return parsed.protocol === 'https:' && parsed.hostname !== 'localhost';
      } catch {
        return false;
      }
    });
  }

  private parseBooleanEnv(value: string | undefined) {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (['true', '1', 'yes', 'si'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }

    return null;
  }

  private isSecureRequest(req?: Request) {
    const forwardedProto = req?.headers['x-forwarded-proto'];
    const forwardedProtoValue = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto;

    if (typeof forwardedProtoValue === 'string') {
      const normalizedProto = forwardedProtoValue
        .split(',')[0]
        ?.trim()
        .toLowerCase();
      if (normalizedProto === 'https') {
        return true;
      }
    }

    if (req?.secure) {
      return true;
    }

    const originHeader = req?.headers.origin;
    if (typeof originHeader === 'string') {
      try {
        return new URL(originHeader).protocol === 'https:';
      } catch {
        return false;
      }
    }

    return false;
  }
}
