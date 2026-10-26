import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogsService } from './catalogs.service';

describe('CatalogsService', () => {
  let service: CatalogsService;

  const mockPrismaService = {
    brand: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    classification: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(
      (
        callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ): Promise<unknown> =>
        callback(mockPrismaService as unknown as Prisma.TransactionClient),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CatalogsService>(CatalogsService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe retornar marcas y clasificaciones', async () => {
      mockPrismaService.brand.findMany.mockResolvedValue([
        { id: 1, nombre: 'Marca A' },
      ]);
      mockPrismaService.classification.findMany.mockResolvedValue([
        { id: 1, nombre: 'Clasificacion A' },
      ]);

      const result = await service.findAll();
      expect(result.brands).toHaveLength(1);
      expect(result.classifications).toHaveLength(1);
    });
  });

  describe('Marcas (brands)', () => {
    it('debe crear una marca', async () => {
      mockPrismaService.brand.create.mockResolvedValue({
        id: 1,
        nombre: 'Ortopedia',
      });
      const result = await service.createBrand({ nombre: ' Ortopedia ' });
      expect(result.message).toContain('correctamente');
      expect(result.brand.nombre).toBe('Ortopedia');
    });

    it('debe lanzar BadRequestException si la marca es duplicada (P2002)', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
        },
      );
      mockPrismaService.brand.create.mockRejectedValue(error);
      await expect(
        service.createBrand({ nombre: 'Ortopedia' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException al actualizar una marca inexistente', async () => {
      mockPrismaService.brand.findUnique.mockResolvedValue(null);
      await expect(
        service.updateBrand(99, { nombre: 'Nueva' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe eliminar una marca existente', async () => {
      mockPrismaService.brand.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Marca',
      });
      mockPrismaService.brand.delete.mockResolvedValue({ id: 1 });
      const result = await service.deleteBrand(1);
      expect(result.message).toContain('correctamente');
    });
  });

  describe('Clasificaciones (classifications)', () => {
    it('debe crear una clasificacion', async () => {
      mockPrismaService.classification.create.mockResolvedValue({
        id: 1,
        nombre: 'Ortesis',
      });
      const result = await service.createClassification({
        nombre: ' Ortesis ',
      });
      expect(result.classification.nombre).toBe('Ortesis');
    });

    it('debe actualizar clasificacion y propagar el nuevo nombre a productos si cambia', async () => {
      mockPrismaService.classification.findUnique.mockResolvedValue({
        id: 1,
        nombre: 'Ortesis Vieja',
      });
      mockPrismaService.classification.update.mockResolvedValue({
        id: 1,
        nombre: 'Ortesis Nueva',
      });

      const result = await service.updateClassification(1, {
        nombre: 'Ortesis Nueva',
      });

      expect(mockPrismaService.product.updateMany).toHaveBeenCalledWith({
        where: { clasificacion: 'Ortesis Vieja' },
        data: { clasificacion: 'Ortesis Nueva' },
      });
      expect(result.classification.nombre).toBe('Ortesis Nueva');
    });
  });
});
