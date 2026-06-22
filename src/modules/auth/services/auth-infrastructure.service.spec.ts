import { Prisma } from '@prisma/client';
import { AuthInfrastructureService } from './auth-infrastructure.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AuthInfrastructureService', () => {
  const missingTableError = new Prisma.PrismaClientKnownRequestError(
    'Table does not exist',
    { code: 'P2021', clientVersion: 'test' },
  );

  it('passes when all auth security tables are reachable', async () => {
    const prisma = {
      userSession: { count: jest.fn().mockResolvedValue(0) },
      loginAttempt: { count: jest.fn().mockResolvedValue(0) },
      authToken: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;

    const service = new AuthInfrastructureService(prisma);

    await expect(
      service.assertAuthSecurityTablesReady(),
    ).resolves.toBeUndefined();
  });

  it('fails startup when a security table is missing', async () => {
    const prisma = {
      userSession: { count: jest.fn().mockRejectedValue(missingTableError) },
      loginAttempt: { count: jest.fn().mockResolvedValue(0) },
      authToken: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;

    const service = new AuthInfrastructureService(prisma);

    await expect(service.assertAuthSecurityTablesReady()).rejects.toThrow(
      /auth_security_tracking/,
    );
  });
});
