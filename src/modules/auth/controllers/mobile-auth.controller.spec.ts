import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { MobileAuthController } from './mobile-auth.controller';
import { AuthService } from '../services/auth.service';

describe('Mobile authentication HTTP contract', () => {
  let app: INestApplication<Server>;
  const session = {
    accessToken: 'access-fixture',
    refreshToken: 'a'.repeat(64),
    accessCookieMaxAgeMs: 900000,
    refreshCookieMaxAgeMs: 604800000,
    user: { id: 1, rol: 'CLIENT' },
  };
  const service = {
    login: jest.fn(),
    refresh: jest.fn(),
    tryLogoutWithRefreshToken: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    service.login.mockResolvedValue(session);
    service.refresh.mockResolvedValue({
      ...session,
      refreshToken: 'b'.repeat(64),
    });
    const module = await Test.createTestingModule({
      controllers: [MobileAuthController],
      providers: [{ provide: AuthService, useValue: service }],
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
  afterEach(async () => {
    await app.close();
  });

  it('returns tokens without setting cookies and prevents caching', async () => {
    const result = await request(app.getHttpServer())
      .post('/auth/mobile/login')
      .send({ correo: 'fixture@example.com', password: 'FixturePassword1!' })
      .expect(201);
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).toEqual({
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessExpiresInMs: 900000,
      refreshExpiresInMs: 604800000,
    });
    expect(service.login).toHaveBeenCalledWith(
      { correo: 'fixture@example.com', password: 'FixturePassword1!' },
      expect.any(String),
    );
  });
  it('accepts refresh only from the explicit body and returns the rotated token', async () => {
    const result = await request(app.getHttpServer())
      .post('/auth/mobile/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(201);
    expect(result.body).toMatchObject({ refreshToken: 'b'.repeat(64) });
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(service.refresh).toHaveBeenCalledWith(session.refreshToken);
  });
  it.each([
    {},
    { refreshToken: '' },
    { refreshToken: 'bad' },
    { refreshToken: 'a'.repeat(64), userId: 1 },
  ])('rejects malformed refresh input %j', async (body) => {
    await request(app.getHttpServer())
      .post('/auth/mobile/refresh')
      .send(body)
      .expect(400);
    expect(service.refresh).not.toHaveBeenCalled();
  });
  it('propagates rejected credentials', async () => {
    service.login.mockRejectedValue(new UnauthorizedException());
    await request(app.getHttpServer())
      .post('/auth/mobile/login')
      .send({ correo: 'fixture@example.com', password: 'FixturePassword1!' })
      .expect(401);
  });
  it('revokes by refresh even when access expired', async () => {
    await request(app.getHttpServer())
      .post('/auth/mobile/logout')
      .send({ refreshToken: session.refreshToken })
      .expect(201);
    expect(service.tryLogoutWithRefreshToken).toHaveBeenCalledWith(
      session.refreshToken,
    );
  });
});
