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
    user: { findFirst: jest.Mock; update: jest.Mock };
    authToken: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let mail: { sendEmailVerificationLink: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn(), update: jest.fn() },
      authToken: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    mail = { sendEmailVerificationLink: jest.fn() };
    const config = {
      emailVerificationExpiresMinutes: 60,
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

    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    expect(createInput.data).toMatchObject({
      userId: 7,
      purpose: AuthTokenPurpose.EMAIL_VERIFICATION_LINK,
      tokenHash: hashAuthValue(rawToken ?? ''),
    });
    expect(createInput.data.tokenHash).not.toBe(rawToken);
    expect(prisma.authToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 7, consumedAt: null }),
      }),
    );
  });

  it('verifies a valid token and consumes all pending verification links', async () => {
    const token = 'a'.repeat(64);
    prisma.authToken.findFirst.mockResolvedValue({
      id: 'token-1',
      userId: 7,
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
    expect(prisma.authToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'token-1' },
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
});
