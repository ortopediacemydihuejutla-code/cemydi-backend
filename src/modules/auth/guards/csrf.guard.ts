import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AuthConfigService } from '../services/auth-config.service';
import { AUTH_CSRF_COOKIE, AUTH_CSRF_HEADER } from '../constants';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authConfigService: AuthConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!this.authConfigService.isCsrfProtectionEnabled(request)) {
      return true;
    }

    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCsrf) {
      return true;
    }

    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return true;
    }

    const cookies = request.cookies as Record<string, unknown> | undefined;
    const cookieToken = cookies?.[AUTH_CSRF_COOKIE];
    const headerToken = request.headers[AUTH_CSRF_HEADER.toLowerCase()];

    if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') {
      throw new ForbiddenException('Token CSRF ausente');
    }

    if (!this.tokensMatch(cookieToken.trim(), headerToken.trim())) {
      throw new ForbiddenException('Token CSRF invalido');
    }

    return true;
  }

  private tokensMatch(cookieToken: string, headerToken: string) {
    const cookieBuffer = Buffer.from(cookieToken);
    const headerBuffer = Buffer.from(headerToken);

    if (cookieBuffer.length !== headerBuffer.length) {
      return false;
    }

    return timingSafeEqual(cookieBuffer, headerBuffer);
  }
}
