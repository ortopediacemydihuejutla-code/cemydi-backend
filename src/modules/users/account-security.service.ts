import { notifySecurityChange } from '../notifications/notification-events';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthTokenPurpose, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../../common/crypto/bcrypt.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthConfigService } from '../auth/services/auth-config.service';
import type { AuthUser } from '../auth/types/auth-user.interface';
import {
  generateNumericAuthCode,
  hashAuthCode,
  verifyAuthCode,
} from '../auth/utils/auth-crypto.util';
import type {
  ConfirmEmailChangeDto,
  ConfirmPasswordChangeDto,
  RequestEmailChangeDto,
  RequestPasswordChangeDto,
} from './dto/account-security.dto';

const RESEND_WAIT_MS = 60_000;
const INVALID_CODE = 'El código es inválido o expiró';

@Injectable()
export class AccountSecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: AuthConfigService,
  ) {}

  private async lockUser(tx: Prisma.TransactionClient, userId: number) {
    await tx.$queryRaw`SELECT "id" FROM "accounts"."users" WHERE "id" = ${userId} FOR UPDATE`;
  }

  private async assertActiveSession(
    tx: Prisma.TransactionClient,
    user: AuthUser,
  ) {
    const session = await tx.userSession.findFirst({
      where: {
        tokenId: user.sid,
        userId: user.sub,
        endedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { tokenId: true },
    });
    if (!session)
      throw new UnauthorizedException(
        'La sesión expiró. Inicia sesión nuevamente.',
      );
  }

  private async currentUser(userId: number) {
    const user = await this.prisma
      .asAdmin()
      .user.findUnique({ where: { id: userId } });
    if (!user || !user.activo || !user.emailVerifiedAt) {
      throw new UnauthorizedException('No se pudo validar el acceso.');
    }
    return user;
  }

  private async checkPassword(userId: number, password: string) {
    const user = await this.currentUser(userId);
    if (!(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('La contraseña actual es incorrecta.');
    }
    return user;
  }

  private tooSoon() {
    return new HttpException(
      'Espera antes de solicitar otro código.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async issue(
    userId: number,
    correo: string,
    purpose: AuthTokenPurpose,
  ) {
    const code = generateNumericAuthCode();
    const codeHash = await hashAuthCode(code);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.passwordResetExpiresMinutes * 60_000,
    );
    const token = await this.prisma.asAdmin().$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const latest = await tx.authToken.findFirst({
        where: { userId, purpose },
        orderBy: { createdAt: 'desc' },
      });
      if (
        latest &&
        latest.createdAt.getTime() > now.getTime() - RESEND_WAIT_MS
      ) {
        throw this.tooSoon();
      }
      await tx.authToken.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: now },
      });
      return tx.authToken.create({
        data: { userId, correo, purpose, codeHash, expiresAt },
      });
    });
    try {
      await this.mail.sendEmail({
        to: correo,
        subject: 'Código de seguridad de CEMYDI',
        html: `<p>Tu código de seguridad es <strong>${code}</strong>.</p><p>Vence en ${this.config.passwordResetExpiresMinutes} minutos.</p>`,
        text: `Tu código de seguridad de CEMYDI es ${code}. Vence en ${this.config.passwordResetExpiresMinutes} minutos.`,
        tag: 'account-security',
      });
    } catch {
      await this.prisma.asAdmin().authToken.updateMany({
        where: { id: token.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      throw new HttpException(
        'No pudimos enviar el código.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return {
      message: 'Enviamos un código de seguridad.',
      resendAt: new Date(now.getTime() + RESEND_WAIT_MS).toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async requestEmailChange(user: AuthUser, dto: RequestEmailChangeDto) {
    const account = await this.checkPassword(user.sub, dto.currentPassword);
    const correo = dto.newEmail.trim().toLowerCase();
    if (correo === account.correo.toLowerCase()) {
      throw new BadRequestException('Ingresa un correo diferente.');
    }
    const occupied = await this.prisma.asAdmin().user.findFirst({
      where: { correo: { equals: correo, mode: 'insensitive' } },
      select: { id: true },
    });
    if (occupied) throw new ConflictException('No se pudo usar ese correo.');
    return this.issue(user.sub, correo, AuthTokenPurpose.EMAIL_CHANGE_CODE);
  }

  async requestPasswordChange(user: AuthUser, dto: RequestPasswordChangeDto) {
    const account = await this.checkPassword(user.sub, dto.currentPassword);
    return this.issue(
      user.sub,
      account.correo,
      AuthTokenPurpose.PASSWORD_CHANGE_CODE,
    );
  }

  private async resend(userId: number, purpose: AuthTokenPurpose) {
    const account = await this.currentUser(userId);
    const token = await this.prisma.asAdmin().authToken.findFirst({
      where: {
        userId,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!token) throw new BadRequestException('Solicita un código nuevo.');
    if (
      purpose === AuthTokenPurpose.PASSWORD_CHANGE_CODE &&
      token.correo !== account.correo
    ) {
      throw new BadRequestException('Solicita un código nuevo.');
    }
    return this.issue(userId, token.correo, purpose);
  }

  resendEmailChange(user: AuthUser) {
    return this.resend(user.sub, AuthTokenPurpose.EMAIL_CHANGE_CODE);
  }

  resendPasswordChange(user: AuthUser) {
    return this.resend(user.sub, AuthTokenPurpose.PASSWORD_CHANGE_CODE);
  }

  private async validateCode(
    userId: number,
    purpose: AuthTokenPurpose,
    correo: string,
    codigo: string,
  ) {
    const token = await this.prisma.asAdmin().authToken.findFirst({
      where: { userId, purpose, correo, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const maxAttempts = this.config.passwordResetMaxAttempts;
    if (
      !token ||
      token.expiresAt <= new Date() ||
      token.attemptCount >= maxAttempts
    ) {
      throw new BadRequestException(INVALID_CODE);
    }
    if (!token.codeHash || !(await verifyAuthCode(codigo, token.codeHash))) {
      await this.prisma.asAdmin().authToken.updateMany({
        where: {
          id: token.id,
          consumedAt: null,
          attemptCount: { lt: maxAttempts },
        },
        data: { attemptCount: { increment: 1 } },
      });
      throw new BadRequestException(INVALID_CODE);
    }
    return token;
  }

  async confirmEmailChange(user: AuthUser, dto: ConfirmEmailChangeDto) {
    const correo = dto.newEmail.trim().toLowerCase();
    const token = await this.validateCode(
      user.sub,
      AuthTokenPurpose.EMAIL_CHANGE_CODE,
      correo,
      dto.codigo,
    );
    try {
      await this.prisma.asAdmin().$transaction(async (tx) => {
        await this.lockUser(tx, user.sub);
        await this.assertActiveSession(tx, user);
        const account = await tx.user.findUnique({ where: { id: user.sub } });
        if (
          !account ||
          !account.activo ||
          !account.emailVerifiedAt ||
          account.correo === correo
        ) {
          throw new BadRequestException(INVALID_CODE);
        }
        const now = new Date();
        const consumed = await tx.authToken.updateMany({
          where: {
            id: token.id,
            userId: user.sub,
            purpose: AuthTokenPurpose.EMAIL_CHANGE_CODE,
            correo,
            consumedAt: null,
            expiresAt: { gt: now },
            attemptCount: { lt: this.config.passwordResetMaxAttempts },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) throw new BadRequestException(INVALID_CODE);
        await tx.user.update({
          where: { id: user.sub },
          data: { correo, emailVerifiedAt: now },
        });
        // Recovery links and other challenges must not survive a credential change.
        await tx.authToken.updateMany({
          where: { userId: user.sub, consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.userSession.updateMany({
          where: { userId: user.sub, endedAt: null },
          data: { endedAt: now, lastSeenAt: now, refreshTokenHash: null },
        });
        await tx.securityNotice.create({
          data: {
            userId: user.sub,
            correo: account.correo,
            kind: 'EMAIL_CHANGED',
          },
        });
        await notifySecurityChange(tx, user.sub, true);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('No se pudo usar ese correo.');
      }
      throw error;
    }
    return { message: 'Correo actualizado. Inicia sesión nuevamente.' };
  }

  async confirmPasswordChange(user: AuthUser, dto: ConfirmPasswordChangeDto) {
    const account = await this.currentUser(user.sub);
    const token = await this.validateCode(
      user.sub,
      AuthTokenPurpose.PASSWORD_CHANGE_CODE,
      account.correo,
      dto.codigo,
    );
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.asAdmin().$transaction(async (tx) => {
      await this.lockUser(tx, user.sub);
      await this.assertActiveSession(tx, user);
      const current = await tx.user.findUnique({ where: { id: user.sub } });
      if (
        !current ||
        !current.activo ||
        !current.emailVerifiedAt ||
        current.correo !== account.correo
      ) {
        throw new BadRequestException(INVALID_CODE);
      }
      const now = new Date();
      const consumed = await tx.authToken.updateMany({
        where: {
          id: token.id,
          userId: user.sub,
          purpose: AuthTokenPurpose.PASSWORD_CHANGE_CODE,
          correo: account.correo,
          consumedAt: null,
          expiresAt: { gt: now },
          attemptCount: { lt: this.config.passwordResetMaxAttempts },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException(INVALID_CODE);
      await tx.user.update({
        where: { id: user.sub },
        data: { password: passwordHash },
      });
      await tx.authToken.updateMany({
        where: { userId: user.sub, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.userSession.updateMany({
        where: { userId: user.sub, endedAt: null },
        data: { endedAt: now, lastSeenAt: now, refreshTokenHash: null },
      });
      await tx.securityNotice.create({
        data: {
          userId: user.sub,
          correo: account.correo,
          kind: 'PASSWORD_CHANGED',
        },
      });
      await notifySecurityChange(tx, user.sub, false);
    });
    return { message: 'Contraseña actualizada. Inicia sesión nuevamente.' };
  }
}
