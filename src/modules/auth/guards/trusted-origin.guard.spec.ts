import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthConfigService } from '../services/auth-config.service';
import { TrustedOriginGuard } from './trusted-origin.guard';

describe('TrustedOriginGuard', () => {
  const config = new AuthConfigService(
    new ConfigService({
      FRONTEND_URL: 'https://cemydi.example',
      BACKEND_PUBLIC_URL: 'https://api.cemydi.example',
      CORS_ORIGIN: 'https://cemydi.example,https://admin.cemydi.example',
    }),
  );
  const guard = new TrustedOriginGuard(config);
  function context(origin?: string): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: { origin } }) }),
    } as ExecutionContext;
  }

  it.each([
    'https://cemydi.example',
    'https://admin.cemydi.example',
    'https://api.cemydi.example',
  ])('accepts the exact configured origin %s', (origin) => {
    expect(guard.canActivate(context(origin))).toBe(true);
  });

  it.each([
    undefined,
    'null',
    'https://evil.example',
    'https://cemydi.example.evil.test',
    'http://cemydi.example',
    'https://cemydi.example:444',
    'https://cemydi.example@evil.example',
  ])('rejects untrusted or absent origin %s', (origin) => {
    expect(() => guard.canActivate(context(origin))).toThrow(
      ForbiddenException,
    );
  });
});
