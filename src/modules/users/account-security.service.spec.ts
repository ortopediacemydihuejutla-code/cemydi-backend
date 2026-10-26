/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { AuthTokenPurpose, Rol } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthConfigService } from '../auth/services/auth-config.service';
import { AccountSecurityService } from './account-security.service';

// These flows deliberately exercise real bcrypt hashes for passwords and OTPs.
jest.setTimeout(15_000);

const identity = {
  sub: 7,
  id: 7,
  sid: 'session-7',
  correo: 'old@example.com',
  rol: Rol.CLIENT,
};

describe('AccountSecurityService', () => {
  let service: AccountSecurityService;
  let account: {
    id: number;
    correo: string;
    password: string;
    activo: boolean;
    emailVerifiedAt: Date;
  };
  let tokens: Array<{
    id: string;
    userId: number;
    correo: string;
    purpose: AuthTokenPurpose;
    codeHash: string;
    createdAt: Date;
    expiresAt: Date;
    consumedAt: Date | null;
    attemptCount: number;
  }>;
  let db: any;
  let mail: { sendEmail: jest.Mock };

  beforeEach(async () => {
    account = {
      id: 7,
      correo: 'old@example.com',
      password: await bcrypt.hash('Current123!', 4),
      activo: true,
      emailVerifiedAt: new Date(),
    };
    tokens = [];
    mail = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const user = {
      findUnique: jest.fn(async () => ({ ...account })),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async ({ data }: { data: Partial<typeof account> }) => {
        Object.assign(account, data);
        return { ...account };
      }),
    };
    const authToken = {
      findFirst: jest.fn(
        async ({ where }: { where: Record<string, any> }) =>
          [...tokens].reverse().find((token) =>
            Object.entries(where).every(([key, value]) => {
              if (key === 'consumedAt') return token.consumedAt === value;
              if (key === 'expiresAt') return token.expiresAt > value.gt;
              return token[key as keyof typeof token] === value;
            }),
          ) ?? null,
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: Omit<
            (typeof tokens)[number],
            'id' | 'createdAt' | 'consumedAt' | 'attemptCount'
          >;
        }) => {
          const token = {
            ...data,
            id: `token-${tokens.length + 1}`,
            createdAt: new Date(),
            consumedAt: null,
            attemptCount: 0,
          };
          tokens.push(token);
          return token;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, any>;
          data: Record<string, any>;
        }) => {
          let count = 0;
          for (const token of tokens) {
            if (where.id !== undefined && token.id !== where.id) continue;
            if (where.userId !== undefined && token.userId !== where.userId)
              continue;
            if (where.purpose !== undefined && token.purpose !== where.purpose)
              continue;
            if (where.correo !== undefined && token.correo !== where.correo)
              continue;
            if (where.consumedAt === null && token.consumedAt !== null)
              continue;
            if (where.expiresAt?.gt && token.expiresAt <= where.expiresAt.gt)
              continue;
            if (
              where.attemptCount?.lt !== undefined &&
              token.attemptCount >= where.attemptCount.lt
            )
              continue;
            if (data.consumedAt) token.consumedAt = data.consumedAt;
            if (data.attemptCount?.increment)
              token.attemptCount += data.attemptCount.increment;
            count++;
          }
          return { count };
        },
      ),
    };
    db = {
      user,
      authToken,
      userSession: {
        findFirst: jest.fn().mockResolvedValue({ tokenId: 'session-7' }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      securityNotice: { create: jest.fn().mockResolvedValue({}) },
      notificationAutomation: {
        findUnique: jest.fn().mockResolvedValue({ security: false }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
    };
    db.$transaction = jest.fn((callback: (tx: typeof db) => Promise<unknown>) =>
      callback(db),
    );
    service = new AccountSecurityService(
      { asAdmin: () => db } as unknown as PrismaService,
      mail as unknown as MailService,
      {
        passwordResetExpiresMinutes: 15,
        passwordResetMaxAttempts: 3,
      } as AuthConfigService,
    );
  });

  it('exige contraseña actual, envía ocho dígitos y mantiene el correo hasta confirmar', async () => {
    await expect(
      service.requestEmailChange(identity, {
        newEmail: 'new@example.com',
        currentPassword: 'wrong',
      }),
    ).rejects.toThrow('contraseña actual');
    await service.requestEmailChange(identity, {
      newEmail: 'new@example.com',
      currentPassword: 'Current123!',
    });
    expect(account.correo).toBe('old@example.com');
    expect(mail.sendEmail.mock.calls[0][0].text).toMatch(/\d{8}/);
    expect(tokens[0].purpose).toBe(AuthTokenPurpose.EMAIL_CHANGE_CODE);
    expect(tokens[0].codeHash).not.toMatch(/^\d{8}$/);
  });

  it('rechaza código inválido, vencido y de otro propósito', async () => {
    await service.requestEmailChange(identity, {
      newEmail: 'new@example.com',
      currentPassword: 'Current123!',
    });
    await expect(
      service.confirmEmailChange(identity, {
        newEmail: 'new@example.com',
        codigo: '00000000',
      }),
    ).rejects.toThrow('inválido');
    expect(tokens[0].attemptCount).toBe(1);
    const code = /\d{8}/.exec(mail.sendEmail.mock.calls[0][0].text)?.[0] ?? '';
    await expect(
      service.confirmPasswordChange(identity, {
        codigo: code,
        newPassword: 'NewSecure123!',
      }),
    ).rejects.toThrow('inválido');
    tokens[0].expiresAt = new Date(Date.now() - 1);
    await expect(
      service.confirmEmailChange(identity, {
        newEmail: 'new@example.com',
        codigo: code,
      }),
    ).rejects.toThrow('inválido');
    expect(account.correo).toBe('old@example.com');
  });

  it('consume una sola vez bajo confirmaciones simultáneas y revoca todas las sesiones', async () => {
    await service.requestEmailChange(identity, {
      newEmail: 'new@example.com',
      currentPassword: 'Current123!',
    });
    const code = /\d{8}/.exec(mail.sendEmail.mock.calls[0][0].text)?.[0] ?? '';
    const results = await Promise.allSettled([
      service.confirmEmailChange(identity, {
        newEmail: 'new@example.com',
        codigo: code,
      }),
      service.confirmEmailChange(identity, {
        newEmail: 'new@example.com',
        codigo: code,
      }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(account.correo).toBe('new@example.com');
    expect(db.userSession.updateMany).toHaveBeenCalledTimes(1);
    expect(db.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7, endedAt: null } }),
    );
    expect(db.securityNotice.create).toHaveBeenCalledWith({
      data: { userId: 7, correo: 'old@example.com', kind: 'EMAIL_CHANGED' },
    });
  });

  it('cambia contraseña con OTP del correo vigente y revoca todas las sesiones', async () => {
    await service.requestPasswordChange(identity, {
      currentPassword: 'Current123!',
    });
    const code = /\d{8}/.exec(mail.sendEmail.mock.calls[0][0].text)?.[0] ?? '';
    await service.confirmPasswordChange(identity, {
      codigo: code,
      newPassword: 'NewSecure123!',
    });
    expect(await bcrypt.compare('NewSecure123!', account.password)).toBe(true);
    expect(db.userSession.updateMany).toHaveBeenCalledTimes(1);
    await expect(
      service.confirmPasswordChange(identity, {
        codigo: code,
        newPassword: 'Another123!',
      }),
    ).rejects.toThrow('inválido');
  });

  it('rechaza confirmar desde una sesión revocada mientras el código sigue vigente', async () => {
    await service.requestEmailChange(identity, {
      newEmail: 'new@example.com',
      currentPassword: 'Current123!',
    });
    const code = /\d{8}/.exec(mail.sendEmail.mock.calls[0][0].text)?.[0] ?? '';
    db.userSession.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.confirmEmailChange(identity, {
        newEmail: 'new@example.com',
        codigo: code,
      }),
    ).rejects.toThrow('sesión expiró');
    expect(account.correo).toBe('old@example.com');
    expect(tokens[0].consumedAt).toBeNull();
  });

  it.each(['email', 'password'] as const)(
    'revoca recuperaciones y otros retos pendientes después de cambiar %s',
    async (change) => {
      if (change === 'email') {
        await service.requestEmailChange(identity, {
          newEmail: 'new@example.com',
          currentPassword: 'Current123!',
        });
      } else {
        await service.requestPasswordChange(identity, {
          currentPassword: 'Current123!',
        });
      }
      tokens.push({
        ...tokens[0],
        id: 'old-reset',
        purpose: AuthTokenPurpose.PASSWORD_RESET_CODE,
      });
      tokens.push({ ...tokens[0], id: 'other-account', userId: 8 });
      const code =
        /\d{8}/.exec(mail.sendEmail.mock.calls[0][0].text)?.[0] ?? '';
      if (change === 'email') {
        await service.confirmEmailChange(identity, {
          newEmail: 'new@example.com',
          codigo: code,
        });
      } else {
        await service.confirmPasswordChange(identity, {
          codigo: code,
          newPassword: 'NewSecure123!',
        });
      }
      expect(
        tokens.find((token) => token.id === 'old-reset')?.consumedAt,
      ).toBeInstanceOf(Date);
      expect(
        tokens.find((token) => token.id === 'other-account')?.consumedAt,
      ).toBeNull();
    },
  );
});
