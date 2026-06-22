import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Rol } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthConfigService } from './auth-config.service';
import type { AuthUser } from '../types/auth-user.interface';
import { hashAuthValue } from '../utils/auth-crypto.util';
import { hasTokenExpiration } from '../utils/auth-tracking.util';
import type {
  PublicUser,
  SerializedAuthUser,
  SessionAuthResult,
} from '../types/auth.types';

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authConfigService: AuthConfigService,
  ) {}

  serializeUser(user: PublicUser): SerializedAuthUser {
    return {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      activo: user.activo,
      rol: user.rol,
      emailVerified: Boolean(user.emailVerifiedAt),
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    };
  }

  buildRevokeSessionsQuery(
    userId: number,
    now: Date,
    options?: {
      excludeSid?: string;
      sessionId?: string;
    },
  ) {
    return this.prisma.userSession.updateMany({
      where: {
        userId,
        endedAt: null,
        ...(options?.excludeSid
          ? {
              tokenId: {
                not: options.excludeSid,
              },
            }
          : {}),
        ...(options?.sessionId
          ? {
              tokenId: options.sessionId,
            }
          : {}),
      },
      data: {
        endedAt: now,
        lastSeenAt: now,
        refreshTokenHash: null,
      },
    });
  }

  async createSessionForUser(
    user: PublicUser & {
      id: number;
      correo: string;
      rol: Rol;
    },
  ): Promise<SessionAuthResult> {
    const sessionId = randomUUID();
    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = hashAuthValue(refreshToken);
    const now = new Date();
    const refreshExpiresAt = new Date(
      now.getTime() +
        this.authConfigService.refreshExpiresDays * 24 * 60 * 60 * 1000,
    );
    const payload = {
      sub: user.id,
      correo: user.correo,
      rol: user.rol,
      sid: sessionId,
    };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.authConfigService.jwtAccessExpiresIn,
    });
    const decodedToken: unknown = this.jwtService.decode(accessToken);
    const tokenExpiration = hasTokenExpiration(decodedToken)
      ? decodedToken.exp
      : undefined;
    const accessExpiresAt = tokenExpiration
      ? new Date(tokenExpiration * 1000)
      : new Date(now.getTime() + 15 * 60 * 1000);

    await this.persistAuthTracking({
      userId: user.id,
      correo: user.correo,
      sessionId,
      refreshTokenHash,
      expiresAt: refreshExpiresAt,
      success: true,
      reason: 'LOGIN_OK',
      attemptedAt: now,
    });

    return {
      accessToken,
      refreshToken,
      user: this.serializeUser(user),
      accessCookieMaxAgeMs: Math.max(
        0,
        accessExpiresAt.getTime() - now.getTime(),
      ),
      refreshCookieMaxAgeMs: Math.max(
        0,
        refreshExpiresAt.getTime() - now.getTime(),
      ),
    };
  }

  async refresh(refreshTokenRaw: string): Promise<SessionAuthResult> {
    const normalizedToken = refreshTokenRaw.trim();
    if (!normalizedToken) {
      throw new UnauthorizedException('Sesion invalida');
    }

    const refreshTokenHash = hashAuthValue(normalizedToken);
    const now = new Date();
    const session = await this.prisma.asAdmin().userSession.findFirst({
      where: {
        refreshTokenHash,
        endedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            nombre: true,
            correo: true,
            activo: true,
            rol: true,
            emailVerifiedAt: true,
          },
        },
      },
    });

    if (!session?.user?.activo || !session.user.emailVerifiedAt) {
      throw new UnauthorizedException('Sesion invalida');
    }

    const rotatedRefreshToken = randomBytes(32).toString('hex');
    const rotatedRefreshHash = hashAuthValue(rotatedRefreshToken);
    const payload = {
      sub: session.user.id,
      correo: session.user.correo,
      rol: session.user.rol,
      sid: session.tokenId,
    };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.authConfigService.jwtAccessExpiresIn,
    });
    const decodedToken: unknown = this.jwtService.decode(accessToken);
    const tokenExpiration = hasTokenExpiration(decodedToken)
      ? decodedToken.exp
      : undefined;
    const accessExpiresAt = tokenExpiration
      ? new Date(tokenExpiration * 1000)
      : new Date(now.getTime() + 15 * 60 * 1000);

    await this.prisma.asAdmin().userSession.update({
      where: {
        tokenId: session.tokenId,
      },
      data: {
        refreshTokenHash: rotatedRefreshHash,
        lastSeenAt: now,
      },
    });

    return {
      accessToken,
      refreshToken: rotatedRefreshToken,
      user: this.serializeUser(session.user),
      accessCookieMaxAgeMs: Math.max(
        0,
        accessExpiresAt.getTime() - now.getTime(),
      ),
      refreshCookieMaxAgeMs: Math.max(
        0,
        session.expiresAt.getTime() - now.getTime(),
      ),
    };
  }

  async tryLogoutWithToken(token: string | null | undefined): Promise<void> {
    if (!token?.trim()) {
      return;
    }
    try {
      const payload = this.jwtService.verify<AuthUser>(token);
      await this.logout(payload);
    } catch {
      /* token inválido o expirado */
    }
  }

  async tryLogoutWithRefreshToken(
    refreshToken: string | null | undefined,
  ): Promise<void> {
    if (!refreshToken?.trim()) {
      return;
    }

    const refreshTokenHash = hashAuthValue(refreshToken.trim());
    const session = await this.prisma.asAdmin().userSession.findFirst({
      where: {
        refreshTokenHash,
        endedAt: null,
      },
      select: {
        tokenId: true,
      },
    });

    if (!session) {
      return;
    }

    await this.revokeSessionByTokenId(session.tokenId);
  }

  async logout(user: AuthUser) {
    await this.revokeSessionByTokenId(user.sid);

    return {
      message: 'Sesión cerrada correctamente',
    };
  }

  async revokeUserSessions(
    userId: number,
    options?: {
      excludeSid?: string;
      sessionId?: string;
    },
  ) {
    const now = new Date();

    return this.prisma.asAdmin().userSession.updateMany({
      where: {
        userId,
        endedAt: null,
        ...(options?.excludeSid
          ? {
              tokenId: {
                not: options.excludeSid,
              },
            }
          : {}),
        ...(options?.sessionId
          ? {
              tokenId: options.sessionId,
            }
          : {}),
      },
      data: {
        endedAt: now,
        lastSeenAt: now,
        refreshTokenHash: null,
      },
    });
  }

  async revokeAllUserSessionsAsAdmin(userId: number) {
    const user = await this.prisma.asAdmin().user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    await this.revokeUserSessions(userId);

    return {
      message: 'Sesiones revocadas correctamente',
    };
  }

  async revokeSingleUserSessionAsAdmin(userId: number, sessionId: string) {
    const session = await this.prisma.asAdmin().userSession.findFirst({
      where: {
        userId,
        tokenId: sessionId,
      },
      select: {
        tokenId: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Sesion no encontrada');
    }

    await this.revokeUserSessions(userId, { sessionId });

    return {
      message: 'Sesion revocada correctamente',
    };
  }

  private async revokeSessionByTokenId(sessionId: string) {
    const now = new Date();
    await this.prisma.asAdmin().userSession.updateMany({
      where: {
        tokenId: sessionId,
        endedAt: null,
      },
      data: {
        endedAt: now,
        lastSeenAt: now,
        refreshTokenHash: null,
      },
    });
  }

  private async persistAuthTracking(input: {
    userId: number;
    correo: string;
    sessionId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    success: boolean;
    reason: string;
    attemptedAt: Date;
  }) {
    await this.prisma.$transaction([
      this.prisma.userSession.create({
        data: {
          id: input.sessionId,
          tokenId: input.sessionId,
          refreshTokenHash: input.refreshTokenHash,
          userId: input.userId,
          createdAt: input.attemptedAt,
          lastSeenAt: input.attemptedAt,
          expiresAt: input.expiresAt,
        },
      }),
      this.prisma.loginAttempt.create({
        data: {
          userId: input.userId,
          correo: input.correo,
          success: input.success,
          reason: input.reason,
          attemptedAt: input.attemptedAt,
        },
      }),
    ]);
  }
}
