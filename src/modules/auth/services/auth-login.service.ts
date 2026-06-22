import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { BCRYPT_ROUNDS } from '../../../common/crypto/bcrypt.constants';
import { AuthConfigService } from './auth-config.service';
import { AuthEmailVerificationService } from './auth-email-verification.service';
import { AuthSessionService } from './auth-session.service';
import { REGISTER_PUBLIC_RESPONSE } from '../constants';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';

@Injectable()
export class AuthLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authConfigService: AuthConfigService,
    private readonly authSessionService: AuthSessionService,
    private readonly authEmailVerificationService: AuthEmailVerificationService,
  ) {}

  async register(dto: RegisterDto) {
    const correo = dto.correo.trim().toLowerCase();
    const userExists = await this.prisma.user.findFirst({
      where: {
        correo: {
          equals: correo,
          mode: 'insensitive',
        },
      },
    });

    if (!userExists) {
      const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

      const user = await this.prisma.user.create({
        data: {
          nombre: dto.nombre.trim(),
          correo,
          password: hashedPassword,
        },
      });

      await this.authEmailVerificationService.issueEmailVerificationLink(
        user.id,
        user.correo,
        user.nombre,
      );
    }

    return { ...REGISTER_PUBLIC_RESPONSE };
  }

  async login(dto: LoginDto) {
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
      await this.registerLoginAttempt({
        correo,
        success: false,
        reason: 'USER_NOT_FOUND',
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    await this.assertKnownUserNotLocked(user.id);

    if (!user.password) {
      await this.registerLoginAttempt({
        userId: user.id,
        correo: user.correo,
        success: false,
        reason: 'INVALID_PASSWORD',
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);

    if (!passwordValid) {
      await this.registerLoginAttempt({
        userId: user.id,
        correo: user.correo,
        success: false,
        reason: 'INVALID_PASSWORD',
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.emailVerifiedAt) {
      await this.registerLoginAttempt({
        userId: user.id,
        correo: user.correo,
        success: false,
        reason: 'EMAIL_NOT_VERIFIED',
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.activo) {
      await this.registerLoginAttempt({
        userId: user.id,
        correo: user.correo,
        success: false,
        reason: 'USER_INACTIVE',
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    return this.authSessionService.createSessionForUser(user);
  }

  private async assertKnownUserNotLocked(userId: number) {
    const windowStart = new Date(
      Date.now() - this.authConfigService.loginLockoutMinutes * 60 * 1000,
    );

    const failedAttempts = await this.prisma.loginAttempt.count({
      where: {
        userId,
        success: false,
        reason: 'INVALID_PASSWORD',
        attemptedAt: {
          gte: windowStart,
        },
      },
    });

    if (failedAttempts >= this.authConfigService.loginMaxFailedAttempts) {
      throw new UnauthorizedException(
        'Demasiados intentos fallidos. Intenta de nuevo mas tarde.',
      );
    }
  }

  private async registerLoginAttempt(input: {
    userId?: number;
    correo: string;
    success: boolean;
    reason: string;
  }) {
    await this.prisma.loginAttempt.create({
      data: {
        userId: input.userId,
        correo: input.correo,
        success: input.success,
        reason: input.reason,
      },
    });
  }
}
