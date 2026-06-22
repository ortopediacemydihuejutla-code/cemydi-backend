import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthConfigService } from '../services/auth-config.service';
import type { AuthUser } from '../types/auth-user.interface';
import { AUTH_ACCESS_COOKIE } from '../constants';

function extractJwtFromCookie(req: Request) {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const raw = cookies?.[AUTH_ACCESS_COOKIE];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function extractJwtFromAuthorizationHeader(req: Request) {
  const authorizationHeader = req.headers.authorization;
  if (typeof authorizationHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token.trim() || null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly lastSeenThrottleMs = 5 * 60 * 1000;

  constructor(
    authConfigService: AuthConfigService,
    private readonly prisma: PrismaService,
  ) {
    // `passport-jwt` exposes loose typings here; we keep the config object explicit.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      jwtFromRequest: (req: Request) =>
        extractJwtFromCookie(req) ?? extractJwtFromAuthorizationHeader(req),
      ignoreExpiration: false,
      secretOrKey: authConfigService.jwtSecret,
    });
  }

  async validate(payload: Partial<AuthUser>) {
    if (!payload.sid) {
      throw new UnauthorizedException('Sesion invalida');
    }

    const now = new Date();
    const session = await this.prisma.asAdmin().userSession.findFirst({
      where: {
        tokenId: payload.sid,
        endedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            correo: true,
            rol: true,
            activo: true,
          },
        },
      },
    });

    if (!session?.user || !session.user.activo) {
      throw new UnauthorizedException('Sesion invalida');
    }

    if (
      now.getTime() - session.lastSeenAt.getTime() >=
      this.lastSeenThrottleMs
    ) {
      await this.prisma.asAdmin().userSession.updateMany({
        where: {
          tokenId: session.tokenId,
          endedAt: null,
          lastSeenAt: {
            lt: new Date(now.getTime() - this.lastSeenThrottleMs),
          },
        },
        data: {
          lastSeenAt: now,
        },
      });
    }

    return {
      sub: session.user.id,
      id: session.user.id,
      correo: session.user.correo,
      rol: session.user.rol,
      sid: session.tokenId,
    } satisfies AuthUser;
  }
}
