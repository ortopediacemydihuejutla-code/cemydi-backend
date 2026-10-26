import { Body, Controller, Header, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AUTH_LOGIN_THROTTLE, AUTH_REFRESH_THROTTLE } from '../constants';
import { SkipCsrf } from '../decorators/skip-csrf.decorator';
import { LoginDto } from '../dto/login.dto';
import { MobileRefreshDto } from '../dto/mobile-refresh.dto';
import { MobileGoogleDto } from '../dto/mobile-google.dto';
import { AuthService } from '../services/auth.service';
import type { SessionAuthResult } from '../types/auth.types';

function serializeSession(result: SessionAuthResult) {
  return {
    user: result.user,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    accessExpiresInMs: result.accessCookieMaxAgeMs,
    refreshExpiresInMs: result.refreshCookieMaxAgeMs,
  };
}

@Controller('auth/mobile')
@SkipCsrf()
export class MobileAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Header('Cache-Control', 'no-store')
  @Throttle(AUTH_LOGIN_THROTTLE)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return serializeSession(
      await this.authService.login(
        dto,
        req.ip || req.socket?.remoteAddress || 'unknown',
      ),
    );
  }

  @Post('google')
  @Header('Cache-Control', 'no-store')
  @Throttle(AUTH_LOGIN_THROTTLE)
  async google(@Body() dto: MobileGoogleDto) {
    return serializeSession(
      await this.authService.loginWithMobileGoogleIdToken(dto.idToken),
    );
  }

  @Post('refresh')
  @Header('Cache-Control', 'no-store')
  @Throttle(AUTH_REFRESH_THROTTLE)
  async refresh(@Body() dto: MobileRefreshDto) {
    return serializeSession(await this.authService.refresh(dto.refreshToken));
  }

  @Post('logout')
  @Header('Cache-Control', 'no-store')
  @Throttle(AUTH_REFRESH_THROTTLE)
  async logout(@Body() dto: MobileRefreshDto) {
    await this.authService.tryLogoutWithRefreshToken(dto.refreshToken);
    return { message: 'Sesión cerrada correctamente' };
  }
}
