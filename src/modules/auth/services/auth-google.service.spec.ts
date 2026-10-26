import { AuthGoogleService } from './auth-google.service';
import { AuthConfigService } from './auth-config.service';
import { AuthSessionService } from './auth-session.service';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('AuthGoogleService mobile', () => {
  const user = {
    id: 1,
    nombre: 'Cliente',
    correo: 'cliente@example.test',
    activo: true,
    rol: 'CLIENT',
    emailVerifiedAt: new Date() as Date | null,
  };
  const upsert = jest.fn();
  const update = jest.fn();
  const revokeTokens = jest.fn();
  const revokeSessions = jest.fn();
  const db = {
    user: { upsert, update },
    authToken: { updateMany: revokeTokens },
    userSession: { updateMany: revokeSessions },
  };
  const createSessionForUser = jest.fn();
  const service = new AuthGoogleService(
    {
      $transaction: (callback: (tx: typeof db) => Promise<unknown>) =>
        callback(db),
    } as unknown as PrismaService,
    { googleClientId: 'web-client' } as AuthConfigService,
    { createSessionForUser } as unknown as AuthSessionService,
  );

  beforeEach(() => {
    upsert.mockReset().mockResolvedValue(user);
    createSessionForUser.mockReset().mockResolvedValue({ user });
    update.mockReset();
    revokeTokens.mockReset();
    revokeSessions.mockReset();
  });
  afterEach(() => jest.restoreAllMocks());

  it('acepta una identidad verificada para un cliente móvil registrado', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          aud: 'web-client',
          sub: 'google-user-1',
          email: 'cliente@example.test',
          email_verified: 'true',
        }),
    } as Response);
    await service.loginWithMobileIdToken('id-token');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(createSessionForUser).toHaveBeenCalledWith(user, db);
    expect(update).not.toHaveBeenCalled();
    expect(revokeTokens).not.toHaveBeenCalled();
  });

  it('invalidates a password planted before the owner signs in with Google', async () => {
    const plantedPassword = 'AttackerPassword123!';
    let passwordHash = await bcrypt.hash(plantedPassword, 4);
    upsert.mockResolvedValue({ ...user, emailVerifiedAt: null });
    update.mockImplementation(({ data }: { data: { password: string } }) => {
      passwordHash = data.password;
      return Promise.resolve({ ...user });
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          aud: 'web-client',
          sub: 'owner',
          email: user.correo,
          email_verified: true,
        }),
    } as Response);

    await service.loginWithMobileIdToken('owner-token');

    expect(await bcrypt.compare(plantedPassword, passwordHash)).toBe(false);
    expect(revokeTokens).toHaveBeenCalledWith({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: expect.any(Date) as unknown },
    });
    expect(revokeSessions).toHaveBeenCalledTimes(1);
    expect(createSessionForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: user.id,
        emailVerifiedAt: expect.any(Date) as unknown,
      }),
      db,
    );
  });

  it('does not create a session or verify an inactive pending account', async () => {
    upsert.mockResolvedValue({ ...user, activo: false, emailVerifiedAt: null });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          aud: 'web-client',
          sub: 'owner',
          email: user.correo,
          email_verified: true,
        }),
    } as Response);
    await expect(service.loginWithMobileIdToken('owner-token')).rejects.toThrow(
      'Cuenta inactiva',
    );
    expect(update).not.toHaveBeenCalled();
    expect(createSessionForUser).not.toHaveBeenCalled();
  });

  it('rechaza tokens emitidos para otra app antes de crear una sesión', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          aud: 'other-client',
          sub: 'google-user-1',
          email: 'cliente@example.test',
          email_verified: 'true',
        }),
    } as Response);
    await expect(service.loginWithMobileIdToken('id-token')).rejects.toThrow(
      'Identidad de Google invalida',
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(createSessionForUser).not.toHaveBeenCalled();
  });
});
