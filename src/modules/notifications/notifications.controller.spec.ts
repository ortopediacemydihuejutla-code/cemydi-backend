import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user.interface';
import {
  NotificationCampaignsController,
  NotificationsController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushDeliveryService } from './push-delivery.service';

describe('notification HTTP authorization and validation', () => {
  let app: INestApplication;
  let origin: string;
  const service = {
    send: jest
      .fn()
      .mockResolvedValue({ id: 'campaign', message: 'Envío registrado' }),
    inbox: jest.fn().mockResolvedValue({ items: [] }),
    savePreferences: jest.fn().mockResolvedValue({ preferences: {} }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [NotificationsController, NotificationCampaignsController],
      providers: [
        RolesGuard,
        { provide: NotificationsService, useValue: service },
        {
          provide: PushDeliveryService,
          useValue: { webConfig: () => ({ publicKey: null }) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const request = context
            .switchToHttp()
            .getRequest<{ headers: Record<string, string>; user?: AuthUser }>();
          const token = request.headers.authorization;
          if (!token) throw new UnauthorizedException();
          request.user = {
            id: 7,
            sub: 7,
            sid: 'session',
            correo: 'test@example.com',
            rol: token === 'Bearer admin' ? 'ADMIN' : 'CLIENT',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => jest.clearAllMocks());
  it('requires authentication and denies campaigns to clients', async () => {
    expect((await fetch(`${origin}/notifications`)).status).toBe(401);
    expect(
      (
        await fetch(`${origin}/admin/notification-campaigns`, {
          headers: { Authorization: 'Bearer client' },
        })
      ).status,
    ).toBe(403);
    expect(service.send).not.toHaveBeenCalled();
  });
  it('rejects extra fields, oversized messages and invalid categories before sending', async () => {
    const payload = {
      requestId: '17cb19b6-d0f8-41fc-a47e-fbd1ecfbfd90',
      title: 'Aviso',
      body: 'Mensaje CEMYDI',
      category: 'SYSTEM',
      audience: 'ALL',
      destinationType: 'NONE',
    };
    for (const changes of [
      { admin: true },
      { body: 'x'.repeat(501) },
      { category: 'BOGUS' },
    ]) {
      const response = await fetch(`${origin}/admin/notification-campaigns`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...payload, ...changes }),
      });
      expect(response.status).toBe(400);
    }
    expect(service.send).not.toHaveBeenCalled();
  });
  it('rejects preferences with string booleans and invalid pagination', async () => {
    const response = await fetch(`${origin}/notifications/preferences`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer client',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pushEnabled: 'false',
        system: true,
        offers: false,
        rentals: true,
      }),
    });
    expect(response.status).toBe(400);
    expect(service.savePreferences).not.toHaveBeenCalled();
    expect(
      (
        await fetch(`${origin}/notifications?page=garbage`, {
          headers: { Authorization: 'Bearer client' },
        })
      ).status,
    ).toBe(400);
  });
  it('serves private inbox responses without caching', async () => {
    const response = await fetch(`${origin}/notifications`, {
      headers: { Authorization: 'Bearer client' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(service.inbox).toHaveBeenCalledWith(7, expect.any(Object));
  });
});
