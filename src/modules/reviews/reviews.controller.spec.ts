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
    setShowOnHome: jest.fn(),
    remove: jest.fn(),
  };

  const mockUser = {
    sub: 1,
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

    await controller.remove(1);
    expect(mockReviewsService.remove).toHaveBeenCalledWith(1);
  });
});
