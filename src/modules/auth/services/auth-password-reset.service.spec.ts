/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { PASSWORD_RESET_PUBLIC_RESPONSE } from '../constants';
import { AuthConfigService } from './auth-config.service';
import { AuthPasswordResetService } from './auth-password-reset.service';
import { AuthSessionService } from './auth-session.service';

describe('AuthPasswordResetService', () => {
  let service: AuthPasswordResetService;
  let prisma: {
    user: { findFirst: jest.Mock; update: jest.Mock };
    authToken: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let mail: { sendPasswordResetCode: jest.Mock };
  let sessions: { buildRevokeSessionsQuery: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn(), update: jest.fn() },
      authToken: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    mail = { sendPasswordResetCode: jest.fn() };
    sessions = { buildRevokeSessionsQuery: jest.fn().mockReturnValue({}) };
    const config = {
      passwordResetExpiresMinutes: 30,
      passwordResetMaxAttempts: 5,
    };

    service = new AuthPasswordResetService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      config as unknown as AuthConfigService,
      sessions as unknown as AuthSessionService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns the same public response when the account does not exist', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.requestPasswordReset({ correo: 'missing@example.com' }),
    ).resolves.toEqual(PASSWORD_RESET_PUBLIC_RESPONSE);
    expect(mail.sendPasswordResetCode).not.toHaveBeenCalled();
  });

  it('invalidates older codes, stores a hash and requests the Brevo email', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 9,
      correo: 'user@example.com',
      nombre: 'Usuario',
    });

    await expect(
      service.requestPasswordReset({ correo: 'user@example.com' }),
    ).resolves.toEqual(PASSWORD_RESET_PUBLIC_RESPONSE);

    const sentCode = mail.sendPasswordResetCode.mock.calls[0][0].code as string;
    const createData = prisma.authToken.create.mock.calls[0][0].data;
    expect(sentCode).toMatch(/^\d{8}$/);
    expect(createData.codeHash).toEqual(expect.any(String));
    expect(createData.codeHash).not.toBe(sentCode);
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 9, consumedAt: null }),
      }),
    );
  });

  it('keeps the generic response when Brevo is temporarily unavailable', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 9,
      correo: 'user@example.com',
      nombre: 'Usuario',
    });
    mail.sendPasswordResetCode.mockRejectedValue(new Error('provider error'));

    await expect(
      service.requestPasswordReset({ correo: 'user@example.com' }),
    ).resolves.toEqual(PASSWORD_RESET_PUBLIC_RESPONSE);
  });

  it('rejects invalid and expired codes with the same public error', async () => {
    prisma.authToken.findFirst
      .mockResolvedValueOnce({
        id: 'invalid-code',
        userId: 9,
        codeHash: 'hash',
        attemptCount: 0,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 9 },
      })
      .mockResolvedValueOnce({
        id: 'expired-code',
        userId: 9,
        codeHash: 'hash',
        attemptCount: 0,
        expiresAt: new Date(Date.now() - 60_000),
        user: { id: 9 },
      });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);

    await expect(
      service.verifyPasswordResetCode({
        correo: 'user@example.com',
        codigo: '12345678',
      }),
    ).rejects.toMatchObject({ message: 'El código es inválido o expiró' });
    expect(prisma.authToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invalid-code' },
        data: { attemptCount: { increment: 1 } },
      }),
    );

    await expect(
      service.verifyPasswordResetCode({
        correo: 'user@example.com',
        codigo: '12345678',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates the password, consumes the code and revokes prior sessions', async () => {
    prisma.authToken.findFirst.mockResolvedValue({
      id: 'valid-code',
      userId: 9,
      codeHash: 'hash',
      attemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 9 },
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);

    await expect(
      service.confirmPasswordReset({
        correo: 'user@example.com',
        codigo: '12345678',
        newPassword: 'NewSecure@1',
      }),
    ).resolves.toEqual({ message: 'Contraseña actualizada correctamente' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 9 },
        data: { password: expect.any(String) },
      }),
    );
    expect(prisma.authToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'valid-code' },
        data: { consumedAt: expect.any(Date) },
      }),
    );
    expect(sessions.buildRevokeSessionsQuery).toHaveBeenCalledWith(
      9,
      expect.any(Date),
    );
  });
});
