import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthConfigService } from './auth-config.service';
import { AuthSessionService } from './auth-session.service';
import { hashAuthValue } from '../utils/auth-crypto.util';
import { Rol } from '@prisma/client';

describe('AuthSessionService conditional rotation', () => {
  it.each(['password', 'correo', 'rol', 'activo'] as const)(
    'rejects an in-flight login when %s changed before session persistence',
    async (field) => {
      const snapshot = {
        id: 1,
        nombre: 'Fixture',
        correo: 'fixture@example.com',
        rol: Rol.CLIENT,
        activo: true,
        emailVerifiedAt: new Date(),
        password: 'old-hash',
      };
      const changes = {
        password: { password: 'new-hash' },
        correo: { correo: 'new@example.com' },
        rol: { rol: Rol.ADMIN },
        activo: { activo: false },
      };
      const create = jest.fn();
      const db = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 1 }]),
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ ...snapshot, ...changes[field] }),
        },
        userSession: { create },
      };
      const service = new AuthSessionService(
        {
          $transaction: (callback: (tx: typeof db) => Promise<unknown>) =>
            callback(db),
        } as unknown as PrismaService,
        {} as JwtService,
        {} as AuthConfigService,
      );

      await expect(
        service.createSessionForUser(snapshot),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('allows only one concurrent rotation of the same refresh hash', async () => {
    let rotated = false;
    const sessions = {
      findFirst: jest.fn().mockResolvedValue({
        tokenId: 'session-fixture',
        expiresAt: new Date(Date.now() + 60000),
        user: {
          id: 1,
          correo: 'fixture@example.com',
          nombre: 'Fixture',
          rol: 'CLIENT',
          activo: true,
          emailVerifiedAt: new Date(),
        },
      }),
      updateMany: jest
        .fn<Promise<{ count: number }>, [unknown]>()
        .mockImplementation(() => {
          const count = rotated ? 0 : 1;
          rotated = true;
          return Promise.resolve({ count });
        }),
    };
    const prisma = {
      asAdmin: () => ({ userSession: sessions }),
    } as unknown as PrismaService;
    const jwt = {
      sign: jest.fn().mockReturnValue('fixture-access'),
      decode: () => ({ exp: Math.floor(Date.now() / 1000) + 900 }),
    } as unknown as JwtService;
    const config = { jwtAccessExpiresIn: '15m' } as AuthConfigService;
    const service = new AuthSessionService(prisma, jwt, config);
    const results = await Promise.allSettled([
      service.refresh('same-refresh'),
      service.refresh('same-refresh'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toBeInstanceOf(
      UnauthorizedException,
    );
    const input: unknown = sessions.updateMany.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      where: {
        tokenId: 'session-fixture',
        refreshTokenHash: hashAuthValue('same-refresh'),
        endedAt: null,
      },
    });
  });
});
