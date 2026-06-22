import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthConfigService } from '../services/auth-config.service';
import { AuthService } from '../services/auth.service';
import {
  AUTH_PASSWORD_RESET_VERIFY_CODE_THROTTLE,
  AUTH_REFRESH_THROTTLE,
} from '../constants';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            resendEmailVerification: jest.fn(),
            confirmEmailVerification: jest.fn(),
            requestPasswordReset: jest.fn(),
            verifyPasswordResetCode: jest.fn(),
            confirmPasswordReset: jest.fn(),
            logout: jest.fn(),
            getSecurityOverview: jest.fn(),
          },
        },
        {
          provide: AuthConfigService,
          useValue: {
            buildFrontendLoginUrl: jest.fn(),
            buildAuthCookieSetOptions: jest.fn(),
            buildAuthCookieClearOptions: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('defines strict rate limiting for password reset code verification', () => {
    const expectedLimit = process.env.NODE_ENV === 'production' ? 5 : 30;
    expect(AUTH_PASSWORD_RESET_VERIFY_CODE_THROTTLE.default.limit).toBe(
      expectedLimit,
    );
    expect(AUTH_PASSWORD_RESET_VERIFY_CODE_THROTTLE.default.ttl).toBe(60_000);
  });

  it('defines rate limiting for refresh token rotation', () => {
    const expectedLimit = process.env.NODE_ENV === 'production' ? 10 : 60;
    expect(AUTH_REFRESH_THROTTLE.default.limit).toBe(expectedLimit);
    expect(AUTH_REFRESH_THROTTLE.default.ttl).toBe(60_000);
  });
});
