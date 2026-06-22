import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppThrottlerGuard } from './app-throttler.guard';
import { PrismaService } from '../../prisma/prisma.service';

describe('AppThrottlerGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const jwtService = {
    verify: jest.fn(),
  } as unknown as JwtService;

  const prismaService = {
    asAdmin: jest.fn(),
  } as unknown as PrismaService;

  const guard = new AppThrottlerGuard(
    [{ ttl: 60_000, limit: 40 }],
    { increment: jest.fn() } as never,
    reflector,
    jwtService,
    prismaService,
  );

  function buildContext(cookieValue?: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          cookies: cookieValue ? { cemydi_access: cookieValue } : {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not skip throttling for admin JWT without active session', async () => {
    (jwtService.verify as jest.Mock).mockReturnValue({
      rol: 'ADMIN',
      sid: 'session-1',
    });
    (prismaService.asAdmin as jest.Mock).mockReturnValue({
      userSession: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });

    const shouldSkip = await guard['shouldSkip'](buildContext('admin-token'));

    expect(shouldSkip).toBe(false);
  });

  it('skips throttling for admin JWT with active session', async () => {
    (jwtService.verify as jest.Mock).mockReturnValue({
      rol: 'ADMIN',
      sid: 'session-1',
    });
    (prismaService.asAdmin as jest.Mock).mockReturnValue({
      userSession: {
        findFirst: jest.fn().mockResolvedValue({
          user: { activo: true },
        }),
      },
    });

    const shouldSkip = await guard['shouldSkip'](buildContext('admin-token'));

    expect(shouldSkip).toBe(true);
  });
});
