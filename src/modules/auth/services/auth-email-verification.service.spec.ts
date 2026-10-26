/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException } from '@nestjs/common';
import { AuthTokenPurpose } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { RESEND_VERIFICATION_RESPONSE } from '../constants';
import { hashAuthValue } from '../utils/auth-crypto.util';
import { AuthConfigService } from './auth-config.service';
import { AuthEmailVerificationService } from './auth-email-verification.service';

describe('AuthEmailVerificationService', () => {
  let service: AuthEmailVerificationService;
  let prisma: {
    user: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    authToken: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let mail: { sendEmailVerificationLink: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          correo: 'user@example.com',
          activo: true,
        }),
      },
      authToken: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(
        (operation: unknown): Promise<unknown> =>
          typeof operation === 'function'
            ? (operation as (tx: unknown) => Promise<unknown>)(prisma)
            : Promise.resolve([]),
      ),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
    };
    mail = { sendEmailVerificationLink: jest.fn() };
    const config = {
      emailVerificationExpiresMinutes: 60,
      emailVerificationMaxAttempts: 5,
      buildFrontendEmailVerificationUrl: jest.fn(
        (token: string) => `https://cemydi.example/verify-email?token=${token}`,
      ),
    };

    service = new AuthEmailVerificationService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      config as unknown as AuthConfigService,
    );
  });

  it('stores only the SHA-256 hash and sends the original token in the link', async () => {
    await service.issueEmailVerificationLink(7, 'user@example.com', 'Usuario');

    const createInput = prisma.authToken.create.mock.calls[0][0];
    const sentUrl = mail.sendEmailVerificationLink.mock.calls[0][0]
      .verificationUrl as string;
    const rawToken = new URL(sentUrl).searchParams.get('token');
    const sentCode = mail.sendEmailVerificationLink.mock.calls[0][0]
      .code as string;

    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    expect(createInput.data).toMatchObject({
      userId: 7,
      purpose: AuthTokenPurpose.EMAIL_VERIFICATION_LINK,
      tokenHash: hashAuthValue(rawToken ?? ''),
      codeHash: expect.any(String),
    });
    expect(sentCode).toMatch(/^\d{8}$/);
    expect(createInput.data.codeHash).not.toBe(sentCode);
    expect(createInput.data.tokenHash).not.toBe(rawToken);
    expect(mail.sendEmailVerificationLink).toHaveBeenCalledWith(
      expect.objectContaining({ expirationMinutes: 60 }),
    );
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 7, consumedAt: null }),
      }),
    );
  });

  it('verifies a valid numeric code and consumes the shared token', async () => {
    prisma.authToken.findFirst.mockResolvedValue({
      id: 'verification-code',
      userId: 7,
      correo: 'user@example.com',
      codeHash: 'hash',
      attemptCount: 0,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);

    await expect(
      service.confirmEmailVerificationCode({
        correo: 'user@example.com',
        codigo: '12345678',
      }),
    ).resolves.toEqual({ message: 'Correo verificado correctamente' });
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'verification-code',
          consumedAt: null,
        }),
        data: { consumedAt: expect.any(Date) },
      }),
    );
  });

  it('counts an invalid verification code attempt', async () => {
    prisma.authToken.findFirst.mockResolvedValue({
      id: 'verification-code',
      userId: 7,
      codeHash: 'hash',
      attemptCount: 0,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);

    await expect(
      service.confirmEmailVerificationCode({
        correo: 'user@example.com',
        codigo: '12345678',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.authToken.update).toHaveBeenCalledWith({
      where: { id: 'verification-code' },
      data: { attemptCount: { increment: 1 } },
    });
  });

  it('verifies a valid token and consumes all pending verification links', async () => {
    const token = 'a'.repeat(64);
    prisma.authToken.findFirst.mockResolvedValue({
      id: 'token-1',
      userId: 7,
      correo: 'user@example.com',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 7 },
    });

    await expect(service.confirmEmailVerification(token)).resolves.toEqual({
      message: 'Correo verificado correctamente',
    });
    expect(prisma.authToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tokenHash: hashAuthValue(token) }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: { emailVerifiedAt: expect.any(Date) },
      }),
    );
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'token-1', consumedAt: null }),
        data: { consumedAt: expect.any(Date) },
      }),
    );
  });

  it.each([
    ['missing', null],
    [
      'expired',
      {
        id: 'expired',
        userId: 7,
        consumedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      },
    ],
    [
      'used',
      {
        id: 'used',
        userId: 7,
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ],
  ])('rejects a %s token', async (_case, authToken) => {
    prisma.authToken.findFirst.mockResolvedValue(authToken);

    await expect(
      service.confirmEmailVerification('b'.repeat(64)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not send another link during the per-account cooldown', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 7,
      correo: 'user@example.com',
      nombre: 'Usuario',
      emailVerifiedAt: null,
    });
    prisma.authToken.findFirst.mockResolvedValue({ id: 'recent-token' });

    await expect(
      service.resendEmailVerification({ correo: 'user@example.com' }),
    ).resolves.toEqual(RESEND_VERIFICATION_RESPONSE);
    expect(mail.sendEmailVerificationLink).not.toHaveBeenCalled();
  });

  it('does not verify a different email after a concurrent administrative change', async () => {
    prisma.authToken.findFirst.mockResolvedValue({
      id: 'old-email-link',
      userId: 7,
      correo: 'old@example.com',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      service.confirmEmailVerification('a'.repeat(64)),
    ).rejects.toThrow('inválido');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not verify an account when the token was revoked before consumption', async () => {
    prisma.authToken.findFirst.mockResolvedValue({
      id: 'revoked-link',
      userId: 7,
      correo: 'user@example.com',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.authToken.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.confirmEmailVerification('a'.repeat(64)),
    ).rejects.toThrow('inválido');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
