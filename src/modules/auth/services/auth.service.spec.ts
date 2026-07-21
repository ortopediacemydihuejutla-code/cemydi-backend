import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthSessionService } from './auth-session.service';
import { AuthEmailVerificationService } from './auth-email-verification.service';
import { AuthPasswordResetService } from './auth-password-reset.service';
import { AuthLoginService } from './auth-login.service';
import { AuthSecurityOverviewService } from './auth-security-overview.service';
import { AuthConfigService } from './auth-config.service';
import { AuthGoogleService } from './auth-google.service';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  REGISTER_PUBLIC_RESPONSE,
  RESEND_VERIFICATION_RESPONSE,
} from '../constants';

const VALID_PASSWORD = 'SecureP@ss1';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: {
    sign: jest.Mock;
    decode: jest.Mock;
    verify: jest.Mock;
  };
  let mailService: {
    sendEmailVerificationLink: jest.Mock;
    sendPasswordResetCode: jest.Mock;
  };
  let prismaService: {
    user: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    userSession: {
      updateMany: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
    };
    loginAttempt: {
      create: jest.Mock;
      count: jest.Mock;
    };
    authToken: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
    asAdmin: jest.Mock;
  };

  beforeEach(async () => {
    prismaService = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      userSession: {
        updateMany: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      loginAttempt: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      authToken: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
      asAdmin: jest.fn(),
    };
    mailService = {
      sendEmailVerificationLink: jest.fn(),
      sendPasswordResetCode: jest.fn(),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('signed-access-token'),
      decode: jest.fn().mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        AuthSessionService,
        AuthEmailVerificationService,
        AuthPasswordResetService,
        AuthLoginService,
        AuthSecurityOverviewService,
        {
          provide: AuthGoogleService,
          useValue: {
            buildGoogleAuthorizationUrl: jest.fn(),
            loginWithAuthorizationCode: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: MailService,
          useValue: mailService,
        },
        {
          provide: AuthConfigService,
          useValue: {
            passwordResetExpiresMinutes: 15,
            emailVerificationExpiresMinutes: 60,
            passwordResetMaxAttempts: 5,
            jwtAccessExpiresIn: '15m',
            refreshExpiresDays: 7,
            loginMaxFailedAttempts: 5,
            loginLockoutMinutes: 15,
            buildFrontendEmailVerificationUrl: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('returns generic credentials error when email is not verified', async () => {
    prismaService.user.findFirst.mockResolvedValue({
      id: 9,
      correo: 'pending@example.com',
      password: '$2b$12$hashed-password',
      emailVerifiedAt: null,
      activo: true,
    });

    // bcrypt's CommonJS export is mutable in Jest; its ESM namespace is not.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);

    await expect(
      service.login({
        correo: 'pending@example.com',
        password: VALID_PASSWORD,
      }),
    ).rejects.toMatchObject({
      message: 'Credenciales invalidas',
    });
  });

  it('blocks login when the account exceeded failed password attempts', async () => {
    prismaService.user.findFirst.mockResolvedValue({
      id: 8,
      correo: 'locked@example.com',
      password: 'hashed-password',
      emailVerifiedAt: new Date(),
      activo: true,
    });
    prismaService.loginAttempt.count.mockResolvedValue(5);

    await expect(
      service.login({
        correo: 'locked@example.com',
        password: VALID_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates refresh tokens and issues a new access token', async () => {
    prismaService.asAdmin.mockReturnValue({
      userSession: {
        findFirst: jest.fn().mockResolvedValue({
          tokenId: 'session-refresh',
          expiresAt: new Date(Date.now() + 60_000),
          user: {
            id: 12,
            nombre: 'Refresh User',
            correo: 'refresh@example.com',
            activo: true,
            rol: 'CLIENT',
            emailVerifiedAt: new Date(),
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    const result = await service.refresh('raw-refresh-token');

    expect(result.accessToken).toBe('signed-access-token');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(jwtService.sign).toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns the same generic register response when the user already exists', async () => {
    prismaService.user.findFirst.mockResolvedValue({
      id: 1,
      correo: 'taken@example.com',
    });

    await expect(
      service.register({
        nombre: 'Taken User',
        correo: 'taken@example.com',
        password: VALID_PASSWORD,
      }),
    ).resolves.toEqual(REGISTER_PUBLIC_RESPONSE);

    expect(prismaService.user.create).not.toHaveBeenCalled();
    expect(mailService.sendEmailVerificationLink).not.toHaveBeenCalled();
  });

  it('returns the same generic register response for new users without exposing user data', async () => {
    prismaService.user.findFirst.mockResolvedValue(null);
    prismaService.user.create.mockResolvedValue({
      id: 2,
      correo: 'new@example.com',
      nombre: 'New User',
    });

    await expect(
      service.register({
        nombre: 'New User',
        correo: 'new@example.com',
        password: VALID_PASSWORD,
      }),
    ).resolves.toEqual(REGISTER_PUBLIC_RESPONSE);

    expect(prismaService.user.create).toHaveBeenCalled();
    expect(mailService.sendEmailVerificationLink).toHaveBeenCalled();
  });

  it('keeps the generic register response when the provider cannot send', async () => {
    prismaService.user.findFirst.mockResolvedValue(null);
    prismaService.user.create.mockResolvedValue({
      id: 20,
      correo: 'pending-send@example.com',
      nombre: 'Pending Send',
    });
    mailService.sendEmailVerificationLink.mockRejectedValue(
      new Error('provider unavailable'),
    );

    await expect(
      service.register({
        nombre: 'Pending Send',
        correo: 'pending-send@example.com',
        password: VALID_PASSWORD,
      }),
    ).resolves.toEqual(REGISTER_PUBLIC_RESPONSE);

    expect(prismaService.user.create).toHaveBeenCalled();
  });

  it('returns the same generic resend response when the email does not exist', async () => {
    prismaService.user.findFirst.mockResolvedValue(null);

    await expect(
      service.resendEmailVerification({ correo: 'missing@example.com' }),
    ).resolves.toEqual(RESEND_VERIFICATION_RESPONSE);

    expect(mailService.sendEmailVerificationLink).not.toHaveBeenCalled();
  });

  it('returns the same generic resend response when the account is already verified', async () => {
    prismaService.user.findFirst.mockResolvedValue({
      id: 3,
      correo: 'verified@example.com',
      nombre: 'Verified User',
      emailVerifiedAt: new Date(),
    });

    await expect(
      service.resendEmailVerification({ correo: 'verified@example.com' }),
    ).resolves.toEqual(RESEND_VERIFICATION_RESPONSE);

    expect(mailService.sendEmailVerificationLink).not.toHaveBeenCalled();
  });

  it('returns the same generic resend response when verification email is sent', async () => {
    prismaService.user.findFirst.mockResolvedValue({
      id: 4,
      correo: 'pending@example.com',
      nombre: 'Pending User',
      emailVerifiedAt: null,
    });

    await expect(
      service.resendEmailVerification({ correo: 'pending@example.com' }),
    ).resolves.toEqual(RESEND_VERIFICATION_RESPONSE);

    expect(mailService.sendEmailVerificationLink).toHaveBeenCalled();
  });

  it('revokes a specific session on logout', async () => {
    prismaService.asAdmin.mockReturnValue({
      userSession: prismaService.userSession,
    });

    await service.logout({
      sub: 3,
      id: 3,
      correo: 'user@example.com',
      rol: 'CLIENT',
      sid: 'session-logout',
    });

    expect(prismaService.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenId: 'session-logout',
          endedAt: null,
        },
      }),
    );
  });
});
