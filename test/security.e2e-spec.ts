import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { buildValidationException } from '../src/common/errors/validation-error.util';

describe('Security and permissions (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        exceptionFactory: buildValidationException,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /analytics requires authentication', () => {
    return request(app.getHttpServer()).get('/analytics').expect(401);
  });

  it('GET /products is public', () => {
    return request(app.getHttpServer()).get('/products').expect(200);
  });

  it('POST /auth/email-verification/confirm validates token body', () => {
    return request(app.getHttpServer())
      .post('/auth/email-verification/confirm')
      .send({})
      .expect(400);
  });

  it('GET /admin/activity requires authentication', () => {
    return request(app.getHttpServer()).get('/admin/activity').expect(401);
  });

  it('GET /users requires authentication', () => {
    return request(app.getHttpServer()).get('/users').expect(401);
  });

  it('POST /products requires authentication', () => {
    return request(app.getHttpServer())
      .post('/products')
      .send({ nombre: 'Test' })
      .expect(401);
  });

  it('GET /reviews/admin requires authentication', () => {
    return request(app.getHttpServer()).get('/reviews/admin').expect(401);
  });

  it('GET /backups/database/status requires authentication', () => {
    return request(app.getHttpServer())
      .get('/backups/database/status')
      .expect(401);
  });
});
