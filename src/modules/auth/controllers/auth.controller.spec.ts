import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthConfigService } from '../services/auth-config.service';
import { AuthService } from '../services/auth.service';
import {
  AUTH_PASSWORD_RESET_VERIFY_CODE_THROTTLE,
  AUTH_REFRESH_THROTTLE,
} from '../constants';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

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
            setCsrfCookie: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('keeps web login cookie-based without exposing tokens in the body', async () => {
    const user = { id: 1, correo: 'fixture@example.com' };
    jest.spyOn(authService, 'login').mockResolvedValue({
      user,
      accessToken: 'access',
      refreshToken: 'refresh',
      accessCookieMaxAgeMs: 900000,
      refreshCookieMaxAgeMs: 604800000,
    } as Awaited<ReturnType<AuthService['login']>>);
    const cookie = jest.fn();
    const result = await controller.login(
      { correo: 'fixture@example.com', password: 'FixturePassword1!' },
      { headers: {}, ip: '127.0.0.1' } as Request,
      { cookie } as unknown as Response,
    );
    expect(result).toEqual({ user });
    expect(cookie).toHaveBeenCalledWith('cemydi_access', 'access', undefined);
    expect(cookie).toHaveBeenCalledWith('cemydi_refresh', 'refresh', undefined);
    expect(result).not.toHaveProperty('accessToken');
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

  it('extracts client IP safely from req.ip without trusting spoofed X-Forwarded-For', () => {
    const mockReq = {
      ip: '203.0.113.195',
      headers: {
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      },
    } as unknown as Request;

    const controllerWithPrivate = controller as unknown as {
      extractClientIp: (req: Request) => string;
    };
    const ip = controllerWithPrivate.extractClientIp(mockReq);
    expect(ip).toBe('203.0.113.195');
  });

  it('falls back to socket remoteAddress when req.ip is absent', () => {
    const mockReq = {
      socket: { remoteAddress: '198.51.100.1' },
      headers: {},
    } as unknown as Request;

    const controllerWithPrivate = controller as unknown as {
      extractClientIp: (req: Request) => string;
    };
    const ip = controllerWithPrivate.extractClientIp(mockReq);
    expect(ip).toBe('198.51.100.1');
  });
});
