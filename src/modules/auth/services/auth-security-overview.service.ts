import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUser } from '../types/auth-user.interface';
import { resolveAuditName } from '../utils/auth-tracking.util';
import type { SecurityOverviewResponse } from '../types/auth.types';

@Injectable()
export class AuthSecurityOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getSecurityOverview(
    user: AuthUser,
  ): Promise<{ overview: SecurityOverviewResponse }> {
    const now = new Date();

    if (user.sid) {
      await this.prisma.userSession.updateMany({
        where: {
          tokenId: user.sid,
          endedAt: null,
        },
        data: {
          lastSeenAt: now,
        },
      });
    }

    const [activeSessions, loginAttempts] = await Promise.all([
      this.prisma.userSession.findMany({
        where: {
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
              rol: true,
            },
          },
        },
        orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
        take: 8,
      }),
      this.prisma.loginAttempt.findMany({
        include: {
          user: {
            select: {
              id: true,
              nombre: true,
              correo: true,
            },
          },
        },
        orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }],
        take: 12,
      }),
    ]);

    const serializedAttempts = loginAttempts.map((attempt) => ({
      id: attempt.id,
      userId: attempt.userId,
      nombre: attempt.user?.nombre ?? resolveAuditName(attempt.correo),
      correo: attempt.user?.correo ?? attempt.correo,
      success: attempt.success,
      reason: attempt.reason,
      attemptedAt: attempt.attemptedAt.toISOString(),
    }));

    return {
      overview: {
        activeSessions: activeSessions.map((session) => ({
          sessionId: session.id,
          userId: session.userId,
          nombre: session.user.nombre,
          correo: session.user.correo,
          rol: session.user.rol,
          createdAt: session.createdAt.toISOString(),
          lastSeenAt: session.lastSeenAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
        })),
        loginAttempts: serializedAttempts,
        summary: {
          activeSessions: activeSessions.length,
          recentAttempts: serializedAttempts.length,
          failedAttempts: serializedAttempts.filter(
            (attempt) => !attempt.success,
          ).length,
        },
      },
    };
  }
}
