import { ConfigService } from '@nestjs/config';
import { AuthConfigService } from './auth-config.service';

describe('AuthConfigService email settings', () => {
  function buildService(values: Record<string, string | undefined>) {
    const configService = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    return new AuthConfigService(configService);
  }

  it('uses positive email expiration settings', () => {
    const service = buildService({
      EMAIL_VERIFICATION_TOKEN_EXPIRATION_MINUTES: '90',
      PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES: '20',
      PASSWORD_RESET_MAX_ATTEMPTS: '4',
    });

    expect(service.emailVerificationExpiresMinutes).toBe(90);
    expect(service.passwordResetExpiresMinutes).toBe(20);
    expect(service.passwordResetMaxAttempts).toBe(4);
  });

  it('falls back safely when email security settings are invalid', () => {
    const service = buildService({
      EMAIL_VERIFICATION_TOKEN_EXPIRATION_MINUTES: 'not-a-number',
      PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES: '0',
      PASSWORD_RESET_MAX_ATTEMPTS: '-1',
    });

    expect(service.emailVerificationExpiresMinutes).toBe(60);
    expect(service.passwordResetExpiresMinutes).toBe(30);
    expect(service.passwordResetMaxAttempts).toBe(5);
  });

  it('supports the legacy expiration variable names', () => {
    const service = buildService({
      EMAIL_VERIFICATION_TOKEN_EXPIRATION_MINUTES: '',
      EMAIL_VERIFICATION_EXPIRES_MINUTES: '75',
      PASSWORD_RESET_EXPIRES_MINUTES: '25',
    });

    expect(service.emailVerificationExpiresMinutes).toBe(75);
    expect(service.passwordResetExpiresMinutes).toBe(25);
  });
});
