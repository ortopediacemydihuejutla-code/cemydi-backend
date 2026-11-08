import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, ReviewStatus, Rol } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  let service: ReviewsService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    asReader: jest.fn().mockReturnThis(),
    forUser: jest.fn().mockReturnThis(),
    review: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
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
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(
      (callback: (tx: typeof mockPrismaService) => Promise<unknown>) =>
        callback(mockPrismaService),
    );
    mockPrismaService.review.updateMany.mockResolvedValue({ count: 1 });
    mockPrismaService.user.findFirst.mockResolvedValue(null);
    mockPrismaService.asReader.mockReturnValue(mockPrismaService);
    mockPrismaService.forUser.mockReturnValue(mockPrismaService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('listApprovedByProduct', () => {
    it('limita la página y conserva el promedio y total de todas las aprobadas', async () => {
      mockPrismaService.review.aggregate.mockResolvedValue({
        _count: { _all: 27 },
        _avg: { rating: 4.456 },
      });
      mockPrismaService.review.findMany.mockResolvedValue([
        { id: 11, rating: 2 },
      ]);
      const result = await service.listApprovedByProduct(10, {
        page: 2,
        pageSize: 10,
      });
      expect(result).toMatchObject({
        summary: { count: 27, averageRating: 4.46 },
        pagination: {
          page: 2,
          pageSize: 10,
          total: 27,
          totalPages: 3,
          hasNextPage: true,
          hasPreviousPage: true,
        },
      });
      expect(mockPrismaService.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: 10, status: ReviewStatus.APPROVED },
          skip: 10,
          take: 10,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(mockPrismaService.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    });
    it('devuelve una página vacía con resumen cero y sin páginas siguientes', async () => {
      mockPrismaService.review.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _avg: { rating: null },
      });
      mockPrismaService.review.findMany.mockResolvedValue([]);
      expect(
        await service.listApprovedByProduct(10, { page: 1 }),
      ).toMatchObject({
        reviews: [],
        summary: { count: 0, averageRating: 0 },
        pagination: { pageSize: 10, totalPages: 1, hasNextPage: false },
      });
    });
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
      expect(result).not.toHaveProperty('pagination');
      const calls = mockPrismaService.review.findMany.mock.calls as unknown[][];
      expect(calls[0]?.[0]).not.toHaveProperty('take');
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

    it.each(['Servicio de mierda', '<script>alert(1)</script>', '     '])(
      'no persiste contenido rechazado: %s',
      async (comment) => {
        mockPrismaService.user.findUnique.mockResolvedValue({
          id: 1,
          activo: true,
        });
        mockPrismaService.product.findUnique.mockResolvedValue({
          id: 10,
          activo: true,
        });
        await expect(
          service.submit(mockUser, { productId: 10, rating: 5, comment }),
        ).rejects.toThrow();
        expect(mockPrismaService.review.upsert).not.toHaveBeenCalled();
      },
    );

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
      mockPrismaService.review.findUnique.mockResolvedValue({
        comment: 'Buen producto',
      });
      mockPrismaService.review.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        userId: 1,
        productId: 10,
        status: ReviewStatus.APPROVED,
      });

      const result = await service.approve(mockUser, 1);
      expect(result.message).toContain('aprobada');
    });

    it('impide aprobar contenido histórico que incumple la política', async () => {
      mockPrismaService.review.findUnique.mockResolvedValue({
        comment: '<svg onload=alert(1)>',
      });
      await expect(service.approve(mockUser, 1)).rejects.toThrow('sin HTML');
      expect(mockPrismaService.review.update).not.toHaveBeenCalled();
    });

    it('debe eliminar una reseña', async () => {
      mockPrismaService.review.delete.mockResolvedValue({ id: 1 });
      const result = await service.remove(1);
      expect(result.message).toContain('correctamente');
    });
  });
  describe('visibilidad después de moderar', () => {
    it('solo activa Inicio si la reseña sigue aprobada al escribir', async () => {
      mockPrismaService.review.findUnique.mockResolvedValue({
        status: ReviewStatus.APPROVED,
        showOnHome: false,
      });
      mockPrismaService.review.count.mockResolvedValue(0);
      mockPrismaService.review.update.mockResolvedValue({
        id: 1,
        showOnHome: true,
      });
      await service.setShowOnHome(1, true);
      expect(mockPrismaService.review.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1, status: ReviewStatus.APPROVED },
        }),
      );
    });
    it('un rechazo concurrente no puede reactivar el testimonio', async () => {
      mockPrismaService.review.findUnique.mockResolvedValue({
        status: ReviewStatus.APPROVED,
        showOnHome: false,
      });
      mockPrismaService.review.count.mockResolvedValue(0);
      mockPrismaService.review.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('changed', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );
      await expect(service.setShowOnHome(1, true)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
