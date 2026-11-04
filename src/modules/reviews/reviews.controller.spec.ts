import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { Test, TestingModule } from '@nestjs/testing';
import { Rol } from '@prisma/client';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

describe('ReviewsController', () => {
  let controller: ReviewsController;

  const mockReviewsService = {
    listApprovedByProduct: jest.fn(),
    listHomeTestimonials: jest.fn(),
    listMine: jest.fn(),
    getMyByProduct: jest.fn(),
    submit: jest.fn(),
    listForAdmin: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    setShowOnHome: jest.fn(),
    remove: jest.fn(),
  };

  const mockUser = {
    sub: 1,
    sid: 'review-test-session',
    id: 1,
    correo: 'user@test.com',
    nombre: 'User',
    rol: Rol.CLIENT,
    activo: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [{ provide: ReviewsService, useValue: mockReviewsService }],
    }).compile();

    controller = module.get<ReviewsController>(ReviewsController);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe listar reseñas aprobadas y testimonios de inicio', async () => {
    mockReviewsService.listApprovedByProduct.mockResolvedValue({ reviews: [] });
    mockReviewsService.listHomeTestimonials.mockResolvedValue({
      testimonials: [],
    });

    await controller.listApprovedByProduct(1);
    expect(mockReviewsService.listApprovedByProduct).toHaveBeenCalledWith(1);

    await controller.listHomeTestimonials();
    expect(mockReviewsService.listHomeTestimonials).toHaveBeenCalled();
  });

  it('debe enviar reseña con submit', async () => {
    const dto = { productId: 1, rating: 5, comment: 'Muy bueno' };
    mockReviewsService.submit.mockResolvedValue({ message: 'enviada' });

    const result = await controller.submit(mockUser, dto);
    expect(mockReviewsService.submit).toHaveBeenCalledWith(mockUser, dto);
    expect(result).toEqual({ message: 'enviada' });
  });

  it('debe aprobar y remover reseñas como admin', async () => {
    mockReviewsService.approve.mockResolvedValue({ message: 'aprobada' });
    mockReviewsService.remove.mockResolvedValue({ message: 'eliminada' });

    await controller.approve(mockUser, 1);
    expect(mockReviewsService.approve).toHaveBeenCalledWith(mockUser, 1);

    await controller.reject(mockUser, 1);
    expect(mockReviewsService.reject).toHaveBeenCalledWith(mockUser, 1);

    await controller.remove(1);
    expect(mockReviewsService.remove).toHaveBeenCalledWith(1);
  });
});

describe('review moderation HTTP authorization', () => {
  let app: INestApplication;
  let origin: string;
  const service = {
    reject: jest.fn().mockResolvedValue({ message: 'Rechazada' }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [RolesGuard, { provide: ReviewsService, useValue: service }],
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
            id: 8,
            sub: 8,
            sid: 'test',
            correo: 'test@example.test',
            rol: token === 'Bearer admin' ? 'ADMIN' : 'CLIENT',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => service.reject.mockClear());
  it('exige sesión y rol ADMIN para rechazar', async () => {
    const guest = await fetch(`${origin}/reviews/12/reject`, {
      method: 'PATCH',
    });
    const client = await fetch(`${origin}/reviews/12/reject`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer client' },
    });
    expect(guest.status).toBe(401);
    expect(client.status).toBe(403);
    expect(service.reject).not.toHaveBeenCalled();
  });
  it('valida id y delega la acción con la identidad del administrador', async () => {
    const invalid = await fetch(`${origin}/reviews/invalid/reject`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer admin' },
    });
    expect(invalid.status).toBe(400);
    expect(service.reject).not.toHaveBeenCalled();
    const allowed = await fetch(`${origin}/reviews/12/reject`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer admin' },
    });
    expect(allowed.status).toBe(200);
    expect(service.reject).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 8, rol: 'ADMIN' }),
      12,
    );
  });
});
