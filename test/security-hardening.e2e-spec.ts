import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Rol } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthController } from '../src/modules/auth/controllers/auth.controller';
import { MobileAuthController } from '../src/modules/auth/controllers/mobile-auth.controller';
import { AuthConfigService } from '../src/modules/auth/services/auth-config.service';
import { AuthService } from '../src/modules/auth/services/auth.service';
import { TrustedOriginGuard } from '../src/modules/auth/guards/trusted-origin.guard';
import type { SessionAuthResult } from '../src/modules/auth/types/auth.types';
import { gzipSync } from 'node:zlib';

describe('Login hardening over HTTP without a database', () => {
  let app: INestApplication<App>;
  const result: SessionAuthResult = {
    accessToken: 'access-fixture',
    refreshToken: 'refresh-fixture',
    accessCookieMaxAgeMs: 900_000,
    refreshCookieMaxAgeMs: 604_800_000,
    user: {
      id: 1,
      nombre: 'Fixture',
      correo: 'fixture@example.com',
      activo: true,
      rol: Rol.CLIENT,
      emailVerified: true,
      emailVerifiedAt: new Date().toISOString(),
    },
  };
  const login = jest.fn().mockResolvedValue(result);
  const credentials = {
    correo: 'fixture@example.com',
    password: 'FixturePassword123!',
  };

  beforeAll(async () => {
    const config = new AuthConfigService(
      new ConfigService({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://cemydi.example',
        CORS_ORIGIN: 'https://cemydi.example',
        BACKEND_PUBLIC_URL: 'https://api.cemydi.example',
      }),
    );
    const module = await Test.createTestingModule({
      controllers: [AuthController, MobileAuthController],
      providers: [
        { provide: AuthService, useValue: { login } },
        { provide: AuthConfigService, useValue: config },
        TrustedOriginGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  beforeEach(() => login.mockClear());
  afterAll(async () => {
    await app?.close();
  });

  it('sets secure cookies for a login from the configured frontend', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'https://cemydi.example')
      .send(credentials)
      .expect(201);
    expect(response.body).toEqual({ user: result.user });
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /cemydi_access=access-fixture;.*HttpOnly; Secure; SameSite=None/,
        ),
      ]),
    );
  });

  it('rejects a cross-site form login before authenticating or setting cookies', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'https://evil.example')
      .type('form')
      .send(credentials)
      .expect(403);
    expect(login).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a web login with no trustworthy Origin', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(403);
    expect(login).not.toHaveBeenCalled();
  });

  it('rejects a malformed compressed body without terminating the HTTP server', async () => {
    const body = Buffer.concat([
      gzipSync(JSON.stringify(credentials)),
      Buffer.from('invalid-gzip-trailer'),
    ]);
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'https://cemydi.example')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send(body)
      .expect(400);
    expect(login).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/auth/mobile/login')
      .send(credentials)
      .expect(201);
  });

  it('keeps mobile login available without browser cookies or Origin', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/mobile/login')
      .send(credentials)
      .expect(201);
    expect(response.body).toMatchObject({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
