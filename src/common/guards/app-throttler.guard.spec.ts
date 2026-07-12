import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppThrottlerGuard } from './app-throttler.guard';

describe('AppThrottlerGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const guard = new AppThrottlerGuard(
    [{ ttl: 60_000, limit: 40 }],
    { increment: jest.fn() } as never,
    reflector,
  );

  function buildContext() {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          cookies: { cemydi_access: 'admin-token' },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not apply an admin session bypass', async () => {
    const shouldSkip = await guard['shouldSkip'](buildContext());

    expect(shouldSkip).toBe(false);
  });
});
