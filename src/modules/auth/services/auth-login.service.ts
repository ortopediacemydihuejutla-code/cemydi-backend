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

  async login(dto: LoginDto, ipAddress?: string) {
    const correo = dto.correo.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        correo: {
          equals: correo,
          mode: 'insensitive',
        },
      },
    });

    await this.assertNotLocked(user?.id, correo, ipAddress);

    if (!user) {
      await this.registerLoginAttempt({
        correo,
        ipAddress,
        success: false,
        reason: 'USER_NOT_FOUND',
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.password) {
      await this.registerLoginAttempt({
        userId: user.id,
        correo: user.correo,
        ipAddress,
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
        ipAddress,
        success: false,
        reason: 'INVALID_PASSWORD',
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.emailVerifiedAt) {
      await this.registerLoginAttempt({
        userId: user.id,
        correo: user.correo,
        ipAddress,
        success: false,
        reason: 'EMAIL_NOT_VERIFIED',
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.activo) {
      await this.registerLoginAttempt({
        userId: user.id,
        correo: user.correo,
        ipAddress,
        success: false,
        reason: 'USER_INACTIVE',
      });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    return this.authSessionService.createSessionForUser(user);
  }

  private async assertNotLocked(
    userId?: number,
    correo?: string,
    ipAddress?: string,
  ) {
    const windowStart = new Date(
      Date.now() - this.authConfigService.loginLockoutMinutes * 60 * 1000,
    );

    const userConditions: Array<Record<string, unknown>> = [];
    if (userId) {
      userConditions.push({ userId });
    }
    if (correo) {
      userConditions.push({ correo: { equals: correo, mode: 'insensitive' } });
    }

    if (userConditions.length > 0) {
      const failedAccountAttempts = await this.prisma.loginAttempt.count({
        where: {
          OR: userConditions,
          success: false,
          attemptedAt: {
            gte: windowStart,
          },
        },
      });

      if (
        failedAccountAttempts >= this.authConfigService.loginMaxFailedAttempts
      ) {
        throw new UnauthorizedException(
          'Demasiados intentos fallidos. Intenta de nuevo mas tarde.',
        );
      }
    }

    if (ipAddress && ipAddress !== 'unknown') {
      const failedIpAttempts = await this.prisma.loginAttempt.count({
        where: {
          ipAddress,
          success: false,
          attemptedAt: {
            gte: windowStart,
          },
        },
      });

      if (failedIpAttempts >= this.authConfigService.loginMaxFailedAttempts) {
        throw new UnauthorizedException(
          'Demasiados intentos fallidos. Intenta de nuevo mas tarde.',
        );
      }
    }
  }

  private async registerLoginAttempt(input: {
    userId?: number;
    correo: string;
    ipAddress?: string;
    success: boolean;
    reason: string;
  }) {
    await this.prisma.loginAttempt.create({
      data: {
        userId: input.userId,
        correo: input.correo,
        ipAddress: input.ipAddress,
        success: input.success,
        reason: input.reason,
      },
    });
  }
}
