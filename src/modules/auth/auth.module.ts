import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './services/auth.service';
import { AuthSessionService } from './services/auth-session.service';
import { AuthEmailVerificationService } from './services/auth-email-verification.service';
import { AuthPasswordResetService } from './services/auth-password-reset.service';
import { AuthLoginService } from './services/auth-login.service';
import { AuthSecurityOverviewService } from './services/auth-security-overview.service';
import { AuthInfrastructureService } from './services/auth-infrastructure.service';
import { AuthController } from './controllers/auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthConfigService } from './services/auth-config.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import type { SignOptions } from 'jsonwebtoken';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    MailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET')?.trim(),
        signOptions: {
          expiresIn: (configService
            .get<string>('JWT_ACCESS_EXPIRES_IN')
            ?.trim() ||
            configService.get<string>('JWT_EXPIRES_IN')?.trim() ||
            '15m') as SignOptions['expiresIn'],
        },
      }),
    }),
  ],
  providers: [
    AuthService,
    AuthSessionService,
    AuthEmailVerificationService,
    AuthPasswordResetService,
    AuthLoginService,
    AuthSecurityOverviewService,
    AuthInfrastructureService,
    AuthConfigService,
    JwtStrategy,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
    CsrfGuard,
  ],
  controllers: [AuthController],
  exports: [
    PassportModule,
    JwtModule,
    AuthService,
    AuthConfigService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
    CsrfGuard,
  ],
})
export class AuthModule {}
