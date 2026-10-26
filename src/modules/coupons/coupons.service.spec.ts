import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CouponDiscountType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CouponsService } from './coupons.service';

describe('CouponsService', () => {
  let service: CouponsService;

  const mockPrismaService = {
    coupon: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CouponsService>(CouponsService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe retornar la lista de cupones', async () => {
      mockPrismaService.coupon.findMany.mockResolvedValue([]);
      const result = await service.findAll();
      expect(result).toEqual({ coupons: [] });
    });
  });

  describe('create', () => {
    const validDto = {
      code: 'verano2026',
      description: 'Cupón Verano',
      discountType: CouponDiscountType.PERCENT,
      discountValue: 20,
      minimumPurchase: 100,
      startAt: '2026-06-01T00:00:00.000Z',
      endAt: '2026-06-30T23:59:59.000Z',
      active: true,
    };

    it('debe crear un cupón correctamente con código en mayúsculas', async () => {
      mockPrismaService.coupon.create.mockResolvedValue({
        id: 1,
        code: 'VERANO2026',
        ...validDto,
      });

      const result = await service.create(validDto);
      expect(result.message).toContain('correctamente');
      expect(mockPrismaService.coupon.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: 'VERANO2026' }) as unknown,
        }),
      );
    });

    it('debe lanzar BadRequestException si la fecha final es menor a la inicial', async () => {
      await expect(
        service.create({
          ...validDto,
          startAt: '2026-06-30T00:00:00.000Z',
          endAt: '2026-06-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si el porcentaje excede 100', async () => {
      await expect(
        service.create({
          ...validDto,
          discountValue: 150,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar ConflictException si el código ya existe (P2002)', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockPrismaService.coupon.create.mockRejectedValue(error);
      await expect(service.create(validDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update & remove', () => {
    it('debe lanzar NotFoundException al actualizar cupón inexistente', async () => {
      mockPrismaService.coupon.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { description: 'test' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe eliminar cupón existente', async () => {
      mockPrismaService.coupon.delete.mockResolvedValue({ id: 1 });
      const result = await service.remove(1);
      expect(result.message).toContain('correctamente');
    });

    it('debe lanzar NotFoundException al eliminar cupón inexistente (P2025)', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        },
      );
      mockPrismaService.coupon.delete.mockRejectedValue(error);
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });
});
