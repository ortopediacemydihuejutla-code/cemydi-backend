import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ReviewStatus, Rol } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  let service: ReviewsService;

  const mockPrismaService = {
    asReader: jest.fn().mockReturnThis(),
    forUser: jest.fn().mockReturnThis(),
    review: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
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
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
    jest.clearAllMocks();
    mockPrismaService.asReader.mockReturnValue(mockPrismaService);
    mockPrismaService.forUser.mockReturnValue(mockPrismaService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('listApprovedByProduct', () => {
    it('debe calcular correctamente el promedio y resumen de reseñas', async () => {
      mockPrismaService.review.findMany.mockResolvedValue([
        {
          id: 1,
          rating: 5,
          comment: 'Excelente',
          createdAt: new Date(),
          user: { id: 1, nombre: 'Ana' },
        },
        {
          id: 2,
          rating: 4,
          comment: 'Bueno',
          createdAt: new Date(),
          user: { id: 2, nombre: 'Luis' },
        },
      ]);

      const result = await service.listApprovedByProduct(10);
      expect(result.summary.count).toBe(2);
      expect(result.summary.averageRating).toBe(4.5);
      expect(result.reviews).toHaveLength(2);
    });
  });

  describe('submit', () => {
    it('debe registrar o actualizar reseña en estado PENDING', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 1,
        activo: true,
      });
      mockPrismaService.product.findUnique.mockResolvedValue({
        id: 10,
        activo: true,
      });
      mockPrismaService.review.upsert.mockResolvedValue({
        id: 1,
        rating: 5,
        comment: 'Excelente producto',
        status: ReviewStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.submit(mockUser, {
        productId: 10,
        rating: 5,
        comment: 'Excelente producto',
      });

      expect(result.message).toContain('pendiente de moderación');
      expect(result.review.status).toBe(ReviewStatus.PENDING);
    });

    it('debe lanzar UnauthorizedException si el usuario no está activo', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 1,
        activo: false,
      });
      await expect(
        service.submit(mockUser, { productId: 10, rating: 5, comment: 'test' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe lanzar NotFoundException si el producto no existe', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 1,
        activo: true,
      });
      mockPrismaService.product.findUnique.mockResolvedValue(null);
      await expect(
        service.submit(mockUser, { productId: 99, rating: 5, comment: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('approve & remove', () => {
    it('debe aprobar una reseña', async () => {
      mockPrismaService.review.update.mockResolvedValue({
        id: 1,
        status: ReviewStatus.APPROVED,
      });

      const result = await service.approve(mockUser, 1);
      expect(result.message).toContain('aprobada');
    });

    it('debe eliminar una reseña', async () => {
      mockPrismaService.review.delete.mockResolvedValue({ id: 1 });
      const result = await service.remove(1);
      expect(result.message).toContain('correctamente');
    });
  });
});
