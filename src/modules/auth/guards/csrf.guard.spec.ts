import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfGuard } from './csrf.guard';
import { AuthConfigService } from '../services/auth-config.service';

describe('CsrfGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const authConfigService = {
    isCsrfProtectionEnabled: jest.fn(),
  } as unknown as AuthConfigService;

  const guard = new CsrfGuard(reflector, authConfigService);

  function buildContext(input: {
    method: string;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  }) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method: input.method,
          cookies: input.cookies,
          headers: input.headers ?? {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
  });

  it('allows GET without CSRF when protection is enabled', () => {
    (authConfigService.isCsrfProtectionEnabled as jest.Mock).mockReturnValue(
      true,
    );

    expect(
      guard.canActivate(
        buildContext({
          method: 'GET',
        }),
      ),
    ).toBe(true);
  });

  it('allows mutations when CSRF protection is disabled', () => {
    (authConfigService.isCsrfProtectionEnabled as jest.Mock).mockReturnValue(
      false,
    );

    expect(
      guard.canActivate(
        buildContext({
          method: 'POST',
        }),
      ),
    ).toBe(true);
  });

  it('rejects mutations without matching CSRF token', () => {
    (authConfigService.isCsrfProtectionEnabled as jest.Mock).mockReturnValue(
      true,
    );

    expect(() =>
      guard.canActivate(
        buildContext({
          method: 'POST',
          cookies: { cemydi_csrf: 'abc' },
          headers: { 'x-csrf-token': 'xyz' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('accepts mutations with matching CSRF token', () => {
    (authConfigService.isCsrfProtectionEnabled as jest.Mock).mockReturnValue(
      true,
    );

    expect(
      guard.canActivate(
        buildContext({
          method: 'PATCH',
          cookies: { cemydi_csrf: 'same-token' },
          headers: { 'x-csrf-token': 'same-token' },
        }),
      ),
    ).toBe(true);
  });
});
