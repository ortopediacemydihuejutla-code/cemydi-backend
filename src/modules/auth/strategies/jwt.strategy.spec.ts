import { UnauthorizedException } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const authConfigService = {
    jwtSecret: '12345678901234567890123456789012',
  };

  it('rejects tokens without sid', async () => {
    const prisma = {
      asAdmin: jest.fn(),
    };
    const strategy = new JwtStrategy(
      authConfigService as never,
      prisma as never,
    );

    await expect(
      strategy.validate({
        sub: 1,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rehydrates the user from the active database session', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      tokenId: 'session-1',
      lastSeenAt: new Date(Date.now() - 6 * 60 * 1000),
      user: {
        id: 15,
        correo: 'db@example.com',
        rol: Rol.ADMIN,
        activo: true,
      },
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      asAdmin: jest.fn().mockReturnValue({
        userSession: {
          findFirst,
          updateMany,
        },
      }),
    };
    const strategy = new JwtStrategy(
      authConfigService as never,
      prisma as never,
    );

    const user = await strategy.validate({
      sid: 'session-1',
      sub: 1,
      correo: 'old@example.com',
      rol: Rol.CLIENT,
    });

    expect(findFirst).toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalled();
    expect(user).toEqual({
      sub: 15,
      id: 15,
      correo: 'db@example.com',
      rol: Rol.ADMIN,
      sid: 'session-1',
    });
  });

  it('rejects closed or missing sessions', async () => {
    const prisma = {
      asAdmin: jest.fn().mockReturnValue({
        userSession: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      }),
    };
    const strategy = new JwtStrategy(
      authConfigService as never,
      prisma as never,
    );

    await expect(
      strategy.validate({
        sid: 'missing-session',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
