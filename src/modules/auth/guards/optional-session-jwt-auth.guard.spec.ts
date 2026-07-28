import type { ExecutionContext } from '@nestjs/common';
import { AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE } from '../constants';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalSessionJwtAuthGuard } from './optional-session-jwt-auth.guard';

function executionContext(request: {
  cookies?: Record<string, string>;
  headers: { authorization?: string };
}) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('OptionalSessionJwtAuthGuard', () => {
  const guard = new OptionalSessionJwtAuthGuard();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows a request with no authentication state', () => {
    const passportGuard = jest.spyOn(JwtAuthGuard.prototype, 'canActivate');

    expect(
      guard.canActivate(executionContext({ cookies: {}, headers: {} })),
    ).toBe(true);
    expect(passportGuard).not.toHaveBeenCalled();
  });

  it.each([
    [{ [AUTH_ACCESS_COOKIE]: 'access-token' }, undefined],
    [{ [AUTH_REFRESH_COOKIE]: 'refresh-token' }, undefined],
    [{}, 'Bearer access-token'],
  ])(
    'delegates authentication when session credentials are present',
    (cookies, authorization) => {
      const context = executionContext({
        cookies,
        headers: { authorization },
      });
      const passportGuard = jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockReturnValue(true);

      expect(guard.canActivate(context)).toBe(true);
      expect(passportGuard).toHaveBeenCalledWith(context);
    },
  );
});
