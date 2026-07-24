import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthTokenPurpose } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { BCRYPT_ROUNDS } from '../../../common/crypto/bcrypt.constants';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthConfigService } from './auth-config.service';
import {
  generateNumericAuthCode,
  hashAuthCode,
  hashAuthValue,
  verifyAuthCode,
} from '../utils/auth-crypto.util';
import { AuthSessionService } from './auth-session.service';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { ConfirmPasswordResetTokenDto } from '../dto/confirm-password-reset-token.dto';
import { RequestPasswordResetDto } from '../dto/request-password-reset.dto';
import { VerifyPasswordResetCodeDto } from '../dto/verify-password-reset-code.dto';
import { PASSWORD_RESET_PUBLIC_RESPONSE } from '../constants';

@Injectable()
export class AuthPasswordResetService {
  private readonly logger = new Logger(AuthPasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly authConfigService: AuthConfigService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const correo = dto.correo.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        correo: {
          equals: correo,
          mode: 'insensitive',
        },
      },
    });

    if (!user) {
      return { ...PASSWORD_RESET_PUBLIC_RESPONSE };
    }

    const cooldownStart = new Date(Date.now() - 60_000);
    const recentToken = await this.prisma.authToken.findFirst({
      where: {
        userId: user.id,
        purpose: AuthTokenPurpose.PASSWORD_RESET_CODE,
        createdAt: { gte: cooldownStart },
      },
      select: { id: true },
    });

    if (recentToken) {
      return { ...PASSWORD_RESET_PUBLIC_RESPONSE };
    }

    const code = generateNumericAuthCode();
    const codeHash = await hashAuthCode(code);
    const rawToken = randomBytes(32).toString('hex');
    const now = new Date();
    const expirationMinutes =
      this.authConfigService.passwordResetExpiresMinutes;
    const expiresAt = new Date(now.getTime() + expirationMinutes * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({
        where: {
          userId: user.id,
          purpose: AuthTokenPurpose.PASSWORD_RESET_CODE,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      }),
      this.prisma.authToken.create({
        data: {
          userId: user.id,
          correo: user.correo,
          purpose: AuthTokenPurpose.PASSWORD_RESET_CODE,
          tokenHash: hashAuthValue(rawToken),
          codeHash,
          expiresAt,
        },
      }),
    ]);

    const resetUrl =
      this.authConfigService.buildFrontendPasswordResetUrl(rawToken);

    try {
      await this.mailService.sendPasswordResetCode({
        correo: user.correo,
        nombre: user.nombre,
        code,
        resetUrl,
        expirationMinutes,
      });
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'Error';
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `No se pudo enviar la recuperación de contraseña. userId=${user.id} tipo=${errorName} detalle=${errorMessage}`,
      );
    }

    return { ...PASSWORD_RESET_PUBLIC_RESPONSE };
  }

  async verifyPasswordResetCode(dto: VerifyPasswordResetCodeDto) {
    const authToken = await this.getValidPasswordResetCode(
      dto.correo,
      dto.codigo,
      true,
    );

    return {
      message: 'Código verificado correctamente',
      expiresAt: authToken.expiresAt.toISOString(),
    };
  }

  async verifyPasswordResetToken(token: string) {
    const authToken = await this.getValidPasswordResetLink(token);

    return {
      message: 'Enlace verificado correctamente',
      expiresAt: authToken.expiresAt.toISOString(),
    };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    const authToken = await this.getValidPasswordResetCode(
      dto.correo,
      dto.codigo,
      true,
    );

    await this.completePasswordReset(
      authToken.id,
      authToken.userId,
      dto.newPassword,
    );

    return {
      message: 'Contraseña actualizada correctamente',
    };
  }

  async confirmPasswordResetToken(dto: ConfirmPasswordResetTokenDto) {
    const authToken = await this.getValidPasswordResetLink(dto.token);
    await this.completePasswordReset(
      authToken.id,
      authToken.userId,
      dto.newPassword,
    );

    return {
      message: 'Contraseña actualizada correctamente',
    };
  }

  private async completePasswordReset(
    authTokenId: string,
    userId: number,
    newPassword: string,
  ) {
    const now = new Date();
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          password: passwordHash,
        },
      }),
      this.prisma.authToken.update({
        where: { id: authTokenId },
        data: {
          consumedAt: now,
        },
      }),
      this.prisma.authToken.updateMany({
        where: {
          userId,
          purpose: AuthTokenPurpose.PASSWORD_RESET_CODE,
          consumedAt: null,
          id: {
            not: authTokenId,
          },
        },
        data: {
          consumedAt: now,
        },
      }),
      this.authSessionService.buildRevokeSessionsQuery(userId, now),
    ]);
  }

  private async getValidPasswordResetCode(
    correoInput: string,
    codigoInput: string,
    registerAttemptOnFailure: boolean,
  ) {
    const correo = correoInput.trim().toLowerCase();
    const codigo = codigoInput.trim();
    const now = new Date();
    const authToken = await this.prisma.authToken.findFirst({
      where: {
        correo,
        purpose: AuthTokenPurpose.PASSWORD_RESET_CODE,
        consumedAt: null,
      },
      include: {
        user: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    if (!authToken || authToken.expiresAt <= now) {
      throw new BadRequestException('El código es inválido o expiró');
    }

    if (
      authToken.attemptCount >= this.authConfigService.passwordResetMaxAttempts
    ) {
      throw new BadRequestException(
        'El código excedió el número de intentos permitidos',
      );
    }

    const codeValid =
      authToken.codeHash && (await verifyAuthCode(codigo, authToken.codeHash));

    if (!codeValid) {
      if (registerAttemptOnFailure) {
        await this.prisma.authToken.update({
          where: { id: authToken.id },
          data: {
            attemptCount: {
              increment: 1,
            },
          },
        });
      }
      throw new BadRequestException('El código es inválido o expiró');
    }

    return authToken;
  }

  private async getValidPasswordResetLink(tokenInput: string) {
    const token = tokenInput.trim();
    const now = new Date();
    const authToken = await this.prisma.authToken.findFirst({
      where: {
        purpose: AuthTokenPurpose.PASSWORD_RESET_CODE,
        tokenHash: hashAuthValue(token),
        consumedAt: null,
      },
    });

    if (!authToken || authToken.expiresAt <= now) {
      throw new BadRequestException('El enlace es inválido o expiró');
    }

    return authToken;
  }
}
