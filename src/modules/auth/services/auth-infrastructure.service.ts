import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { isMissingTrackingTableError } from '../utils/auth-tracking.util';

const AUTH_SECURITY_MIGRATION =
  '20260319101500_auth_security_tracking/migration.sql';

@Injectable()
export class AuthInfrastructureService implements OnModuleInit {
  private readonly logger = new Logger(AuthInfrastructureService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.assertAuthSecurityTablesReady();
  }

  async assertAuthSecurityTablesReady() {
    const checks = [
      {
        label: 'UserSession',
        run: () => this.prisma.userSession.count(),
      },
      {
        label: 'LoginAttempt',
        run: () => this.prisma.loginAttempt.count(),
      },
      {
        label: 'AuthToken',
        run: () => this.prisma.authToken.count(),
      },
    ] as const;

    for (const check of checks) {
      try {
        await check.run();
      } catch (error) {
        if (isMissingTrackingTableError(error)) {
          throw new Error(
            `Falta la tabla de seguridad ${check.label}. Ejecuta la migracion prisma/${AUTH_SECURITY_MIGRATION} antes de iniciar el backend.`,
          );
        }

        throw error;
      }
    }

    this.logger.log('Tablas de seguridad de autenticacion verificadas.');
  }
}
