import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthTokenPurpose } from '@prisma/client';
import { randomBytes } from 'crypto';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthConfigService } from './auth-config.service';
import { hashAuthValue } from '../utils/auth-crypto.util';
import { EmailActionDto } from '../dto/email-action.dto';
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

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: authToken.userId },
        data: {
          emailVerifiedAt: now,
        },
      }),
      this.prisma.authToken.update({
        where: { id: authToken.id },
        data: {
          consumedAt: now,
        },
      }),
      this.prisma.authToken.updateMany({
        where: {
          userId: authToken.userId,
          purpose: AuthTokenPurpose.EMAIL_VERIFICATION_LINK,
          consumedAt: null,
          id: {
            not: authToken.id,
          },
        },
        data: {
          consumedAt: now,
        },
      }),
    ]);

    return {
      message: 'Correo verificado correctamente',
    };
  }

  async issueEmailVerificationLink(
    userId: number,
    correo: string,
    nombre: string,
  ) {
    const rawToken = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() +
        this.authConfigService.emailVerificationExpiresMinutes * 60 * 1000,
    );

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
      });
      return true;
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'Error';
      this.logger.error(
        `No se pudo enviar la verificación. userId=${userId} tipo=${errorName}`,
      );
      return false;
    }
  }
}
