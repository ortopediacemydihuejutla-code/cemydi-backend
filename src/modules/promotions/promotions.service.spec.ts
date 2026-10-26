import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PromotionImageStrategy, Rol } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsCloudinaryService } from '../products/products-cloudinary.service';
import { PromotionsService } from './promotions.service';

describe('PromotionsService', () => {
  let service: PromotionsService;

  const mockPrismaService = {
    forUser: jest.fn().mockReturnThis(),
    promotion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: {
      count: jest.fn(),
    },
  };

  const mockCloudinaryService = {
    uploadPromotionImage: jest.fn(),
    deleteUploadedImagesQuietly: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: ProductsCloudinaryService,
          useValue: mockCloudinaryService,
        },
      ],
    }).compile();

    service = module.get<PromotionsService>(PromotionsService);
    jest.clearAllMocks();
    mockPrismaService.forUser.mockReturnValue(mockPrismaService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe retornar promociones públicas filtradas', async () => {
      mockPrismaService.promotion.findMany.mockResolvedValue([]);
      const result = await service.findAll({ includeExpired: false });
      expect(result).toEqual({ promotions: [] });
    });

    it('debe listar todas las promociones si es admin e includeExpired es true', async () => {
      const adminUser = {
        id: 1,
        correo: 'admin@cemydi.com',
        nombre: 'Admin',
        rol: Rol.ADMIN,
        activo: true,
      };
      mockPrismaService.promotion.findMany.mockResolvedValue([]);
      const result = await service.findAll({
        includeExpired: true,
        user: adminUser,
      });
      expect(result).toEqual({ promotions: [] });
    });
  });

  describe('create', () => {
    const validDto = {
      discountPercent: 15,
      descripcion: 'Descuento 15%',
      startAt: '2026-06-01T00:00:00.000Z',
      endAt: '2026-06-30T23:59:59.000Z',
      imageStrategy: PromotionImageStrategy.AUTO,
      productIds: '[1, 2]',
    };

    it('debe crear una promoción en modo automático', async () => {
      mockPrismaService.product.count.mockResolvedValue(2);
      mockPrismaService.promotion.create.mockResolvedValue({
        id: 1,
        discountPercent: 15,
        descripcion: 'Descuento 15%',
        startAt: new Date(validDto.startAt),
        endAt: new Date(validDto.endAt),
        imageStrategy: PromotionImageStrategy.AUTO,
        imageUrl: null,
        products: [],
      });

      const result = await service.create(validDto);
      expect(result.message).toContain('Promoción creada');
      expect(mockPrismaService.promotion.create).toHaveBeenCalled();
    });

    it('debe lanzar BadRequestException si algún producto no existe', async () => {
      mockPrismaService.product.count.mockResolvedValue(1); // Esperaba 2
      await expect(service.create(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update & remove', () => {
    it('debe lanzar NotFoundException al actualizar promoción inexistente', async () => {
      mockPrismaService.promotion.findUnique.mockResolvedValue(null);
      await expect(
        service.update(99, { descripcion: 'Inexistente' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe eliminar promoción existente', async () => {
      mockPrismaService.promotion.findUnique.mockResolvedValue({
        id: 1,
        imageUrl: null,
        imageCloudinaryPublicId: null,
      });
      mockPrismaService.promotion.delete.mockResolvedValue({ id: 1 });

      const result = await service.remove(1);
      expect(result.message).toContain('correctamente');
    });
  });
});
