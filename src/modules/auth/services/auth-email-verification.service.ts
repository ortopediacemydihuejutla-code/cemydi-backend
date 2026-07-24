import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthTokenPurpose } from '@prisma/client';
import { randomBytes } from 'crypto';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthConfigService } from './auth-config.service';
import {
  generateNumericAuthCode,
  hashAuthCode,
  hashAuthValue,
  verifyAuthCode,
} from '../utils/auth-crypto.util';
import { EmailActionDto } from '../dto/email-action.dto';
import { ConfirmEmailVerificationCodeDto } from '../dto/confirm-email-verification-code.dto';
import { RESEND_VERIFICATION_RESPONSE } from '../constants';

@Injectable()
export class AuthEmailVerificationService {
  private readonly logger = new Logger(AuthEmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly authConfigService: AuthConfigService,
  ) {}

  async resendEmailVerification(dto: EmailActionDto) {
    const correo = dto.correo.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        correo: {
          equals: correo,
          mode: 'insensitive',
        },
      },
    });

    if (user && !user.emailVerifiedAt) {
      const cooldownStart = new Date(Date.now() - 60_000);
      const recentToken = await this.prisma.authToken.findFirst({
        where: {
          userId: user.id,
          purpose: AuthTokenPurpose.EMAIL_VERIFICATION_LINK,
          createdAt: { gte: cooldownStart },
        },
        select: { id: true },
      });

      if (!recentToken) {
        try {
          await this.issueEmailVerificationLink(
            user.id,
            user.correo,
            user.nombre,
          );
        } catch (error) {
          const errorName = error instanceof Error ? error.name : 'Error';
          this.logger.error(
            `No se pudo reenviar la verificación. userId=${user.id} tipo=${errorName}`,
          );
        }
      }
    }

    return { ...RESEND_VERIFICATION_RESPONSE };
  }

  async confirmEmailVerification(token: string) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new BadRequestException('Token inválido');
    }

    const tokenHash = hashAuthValue(normalizedToken);
    const now = new Date();
    const authToken = await this.prisma.authToken.findFirst({
      where: {
        purpose: AuthTokenPurpose.EMAIL_VERIFICATION_LINK,
        tokenHash,
      },
      include: {
        user: true,
      },
    });

    if (!authToken || authToken.consumedAt || authToken.expiresAt <= now) {
      throw new BadRequestException(
        'El enlace de verificación es inválido o expiró',
      );
    }

    await this.completeEmailVerification(authToken.id, authToken.userId, now);

    return {
      message: 'Correo verificado correctamente',
    };
  }

  async confirmEmailVerificationCode(dto: ConfirmEmailVerificationCodeDto) {
    const correo = dto.correo.trim().toLowerCase();
    const codigo = dto.codigo.trim();
    const now = new Date();
    const authToken = await this.prisma.authToken.findFirst({
      where: {
        correo,
        purpose: AuthTokenPurpose.EMAIL_VERIFICATION_LINK,
        consumedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    if (!authToken || authToken.expiresAt <= now) {
      throw new BadRequestException('El código es inválido o expiró');
    }

    if (
      authToken.attemptCount >=
      this.authConfigService.emailVerificationMaxAttempts
    ) {
      throw new BadRequestException(
        'El código excedió el número de intentos permitidos',
      );
    }

    const codeValid =
      authToken.codeHash && (await verifyAuthCode(codigo, authToken.codeHash));

    if (!codeValid) {
      await this.prisma.authToken.update({
        where: { id: authToken.id },
        data: {
          attemptCount: {
            increment: 1,
          },
        },
      });
      throw new BadRequestException('El código es inválido o expiró');
    }

    await this.completeEmailVerification(authToken.id, authToken.userId, now);

    return {
      message: 'Correo verificado correctamente',
    };
  }

  private async completeEmailVerification(
    authTokenId: string,
    userId: number,
    now: Date,
  ) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          emailVerifiedAt: now,
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
          purpose: AuthTokenPurpose.EMAIL_VERIFICATION_LINK,
          consumedAt: null,
          id: {
            not: authTokenId,
          },
        },
        data: {
          consumedAt: now,
        },
      }),
    ]);
  }

  async issueEmailVerificationLink(
    userId: number,
    correo: string,
    nombre: string,
  ) {
    const rawToken = randomBytes(32).toString('hex');
    const code = generateNumericAuthCode();
    const codeHash = await hashAuthCode(code);
    const now = new Date();
    const expirationMinutes =
      this.authConfigService.emailVerificationExpiresMinutes;
    const expiresAt = new Date(now.getTime() + expirationMinutes * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({
        where: {
          userId,
          purpose: AuthTokenPurpose.EMAIL_VERIFICATION_LINK,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      }),
      this.prisma.authToken.create({
        data: {
          userId,
          correo,
          purpose: AuthTokenPurpose.EMAIL_VERIFICATION_LINK,
          tokenHash: hashAuthValue(rawToken),
          codeHash,
          expiresAt,
        },
      }),
    ]);

    const verificationUrl =
      this.authConfigService.buildFrontendEmailVerificationUrl(rawToken);

    try {
      await this.mailService.sendEmailVerificationLink({
        correo,
        nombre,
        verificationUrl,
        code,
        expirationMinutes,
      });
      return true;
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'Error';
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `No se pudo enviar la verificación. userId=${userId} tipo=${errorName} detalle=${errorMessage}`,
      );
      return false;
    }
  }
}
