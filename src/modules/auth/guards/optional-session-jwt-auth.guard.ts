import { ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE } from '../constants';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class OptionalSessionJwtAuthGuard extends JwtAuthGuard {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const accessToken = cookies?.[AUTH_ACCESS_COOKIE];
    const refreshToken = cookies?.[AUTH_REFRESH_COOKIE];
    const authorization = request.headers.authorization;

    const hasAccessToken =
      typeof accessToken === 'string' && accessToken.trim().length > 0;
    const hasRefreshToken =
      typeof refreshToken === 'string' && refreshToken.trim().length > 0;
    const hasAuthorization =
      typeof authorization === 'string' && authorization.trim().length > 0;

    if (!hasAccessToken && !hasRefreshToken && !hasAuthorization) {
      return true;
    }

    return super.canActivate(context);
  }
}
