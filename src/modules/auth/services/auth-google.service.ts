import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { BCRYPT_ROUNDS } from '../../../common/crypto/bcrypt.constants';
import { AuthConfigService } from './auth-config.service';
import { AuthSessionService } from './auth-session.service';
import type { SessionAuthResult } from '../types/auth.types';

type GoogleTokenResponse = {
  id_token?: string;
  error_description?: string;
};

type GoogleTokenInfoResponse = {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
};

@Injectable()
export class AuthGoogleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authConfigService: AuthConfigService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  buildGoogleAuthorizationUrl(state: string) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', this.authConfigService.googleClientId);
    url.searchParams.set(
      'redirect_uri',
      this.authConfigService.googleRedirectUri,
    );
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  async loginWithAuthorizationCode(code: string): Promise<SessionAuthResult> {
    const tokenResponse = await this.exchangeCodeForTokens(code);
    if (!tokenResponse.id_token) {
      throw new UnauthorizedException(
        'Google no devolvio una identidad valida',
      );
    }

    const profile = await this.verifyGoogleIdentity(tokenResponse.id_token, [
      this.authConfigService.googleClientId,
    ]);
    return this.createSessionFromGoogleProfile(profile);
  }

  async loginWithMobileIdToken(idToken: string): Promise<SessionAuthResult> {
    const profile = await this.verifyGoogleIdentity(idToken, [
      this.authConfigService.googleClientId,
    ]);
    return this.createSessionFromGoogleProfile(profile);
  }

  private async createSessionFromGoogleProfile(
    profile: GoogleTokenInfoResponse,
  ): Promise<SessionAuthResult> {
    const email = profile.email?.trim().toLowerCase();
    const emailVerified =
      profile.email_verified === true || profile.email_verified === 'true';

    if (!email || !emailVerified) {
      throw new UnauthorizedException('Google no pudo verificar el correo');
    }

    const displayName =
      profile.name?.trim() ||
      [profile.given_name, profile.family_name]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(' ') ||
      email.split('@')[0] ||
      'Cliente CEMYDI';

    const now = new Date();
    const unusablePassword = await this.createUnusablePasswordHash();
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.user.upsert({
        where: { correo: email },
        update: {
          // A real update locks an existing account until this transaction commits.
          correo: email,
        },
        create: {
          nombre: displayName,
          correo: email,
          password: unusablePassword,
          emailVerifiedAt: now,
        },
        select: {
          id: true,
          nombre: true,
          correo: true,
          activo: true,
          rol: true,
          emailVerifiedAt: true,
        },
      });
      if (!account.activo) {
        throw new UnauthorizedException('Cuenta inactiva');
      }
      if (!account.emailVerifiedAt) {
        // A pending registration may contain a password chosen by someone else.
        await tx.user.update({
          where: { id: account.id },
          data: { password: unusablePassword, emailVerifiedAt: now },
        });
        await tx.authToken.updateMany({
          where: { userId: account.id, consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.userSession.updateMany({
          where: { userId: account.id, endedAt: null },
          data: { endedAt: now, lastSeenAt: now, refreshTokenHash: null },
        });
        account.emailVerifiedAt = now;
      }
      return this.authSessionService.createSessionForUser(account, tx);
    });
  }

  private async exchangeCodeForTokens(code: string) {
    const params = new URLSearchParams({
      code,
      client_id: this.authConfigService.googleClientId,
      client_secret: this.authConfigService.googleClientSecret,
      redirect_uri: this.authConfigService.googleRedirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const body = (await response
      .json()
      .catch(() => ({}))) as GoogleTokenResponse;
    if (!response.ok) {
      throw new ServiceUnavailableException(
        body.error_description || 'No se pudo conectar con Google',
      );
    }

    return body;
  }

  private async verifyGoogleIdentity(
    idToken: string,
    allowedAudiences: string[],
  ) {
    const url = new URL('https://oauth2.googleapis.com/tokeninfo');
    url.searchParams.set('id_token', idToken);
    const response = await fetch(url);
    const body = (await response
      .json()
      .catch(() => ({}))) as GoogleTokenInfoResponse;

    if (
      !response.ok ||
      !body.sub ||
      !body.aud ||
      !allowedAudiences.includes(body.aud)
    ) {
      throw new UnauthorizedException('Identidad de Google invalida');
    }

    return body;
  }

  private async createUnusablePasswordHash() {
    return bcrypt.hash(randomBytes(48).toString('hex'), BCRYPT_ROUNDS);
  }
}
