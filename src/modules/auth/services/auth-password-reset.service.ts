import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthTokenPurpose } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../../../common/crypto/bcrypt.constants';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthConfigService } from './auth-config.service';
import {
  generateNumericAuthCode,
  hashAuthCode,
  verifyAuthCode,
} from '../utils/auth-crypto.util';
import { AuthSessionService } from './auth-session.service';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { RequestPasswordResetDto } from '../dto/request-password-reset.dto';
import { VerifyPasswordResetCodeDto } from '../dto/verify-password-reset-code.dto';

@Injectable()
export class AuthPasswordResetService {
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
      return {
        message:
          'Si el correo existe, enviaremos un código para restablecer la contraseña.',
      };
    }

    const code = generateNumericAuthCode();
    const codeHash = await hashAuthCode(code);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() +
        this.authConfigService.passwordResetExpiresMinutes * 60 * 1000,
    );

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
          codeHash,
          expiresAt,
        },
      }),
    ]);

    await this.mailService.sendPasswordResetCode({
      correo: user.correo,
      nombre: user.nombre,
      code,
    });

    return {
      message:
        'Si el correo existe, enviaremos un código para restablecer la contraseña.',
    };
  }

  async verifyPasswordResetCode(dto: VerifyPasswordResetCodeDto) {
    const authToken = await this.getValidPasswordResetToken(
      dto.correo,
      dto.codigo,
      true,
    );

    return {
      message: 'Código verificado correctamente',
      expiresAt: authToken.expiresAt.toISOString(),
    };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    const now = new Date();
    const authToken = await this.getValidPasswordResetToken(
      dto.correo,
      dto.codigo,
      true,
    );

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: authToken.userId },
        data: {
          password: passwordHash,
        },
      }),
      this.prisma.authToken.update({
        where: { id: authToken.id },
        data: {
          consumedAt: now,
        },
      }),
      this.authSessionService.buildRevokeSessionsQuery(authToken.userId, now),
    ]);

    return {
      message: 'Contraseña actualizada correctamente',
    };
  }

  private async getValidPasswordResetToken(
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
}
