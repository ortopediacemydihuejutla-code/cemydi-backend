import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import { AUTH_ACCESS_COOKIE } from '../../modules/auth/constants';
import { PrismaService } from '../../prisma/prisma.service';

type AccessTokenPayload = {
  rol?: string;
  sid?: string;
};

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {
    super(options, storageService, reflector);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (await super.shouldSkip(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const rawToken = cookies?.[AUTH_ACCESS_COOKIE];

    if (typeof rawToken !== 'string' || !rawToken.trim()) {
      return false;
    }

    try {
      const payload = this.jwtService.verify<AccessTokenPayload>(
        rawToken.trim(),
      );
      if (payload.rol !== 'ADMIN' || !payload.sid) {
        return false;
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
              activo: true,
            },
          },
        },
      });

      return Boolean(session?.user?.activo);
    } catch {
      return false;
    }
  }
}
