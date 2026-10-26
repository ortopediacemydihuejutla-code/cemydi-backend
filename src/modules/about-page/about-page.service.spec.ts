import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsCloudinaryService } from '../products/products-cloudinary.service';
import { AboutPageService } from './about-page.service';
import type { UploadedProductFile } from '../products/products-cloudinary.types';

describe('AboutPageService', () => {
  let service: AboutPageService;

  const mockPrismaService = {
    asReader: jest.fn().mockReturnThis(),
    aboutPage: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const mockCloudinaryService = {
    validateImageOperation: jest.fn(),
    uploadProductImages: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AboutPageService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: ProductsCloudinaryService,
          useValue: mockCloudinaryService,
        },
      ],
    }).compile();

    service = module.get<AboutPageService>(AboutPageService);
    jest.clearAllMocks();
    mockPrismaService.asReader.mockReturnValue(mockPrismaService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('getPublicContent', () => {
    it('debe retornar el contenido con valores por defecto si values no es array', async () => {
      mockPrismaService.aboutPage.findUnique.mockResolvedValue({
        id: 1,
        heroTitle: 'Titulo',
        values: null,
      });

      const result = await service.getPublicContent();
      expect(result.aboutPage).toBeDefined();
      expect(result.aboutPage?.values).toEqual([
        'Empatía',
        'Confianza',
        'Responsabilidad',
        'Servicio',
        'Calidad',
      ]);
    });

    it('debe retornar null si no existe la página', async () => {
      mockPrismaService.aboutPage.findUnique.mockResolvedValue(null);
      const result = await service.getPublicContent();
      expect(result.aboutPage).toBeNull();
    });
  });

  describe('update', () => {
    it('debe actualizar campos de texto y retornar mensaje', async () => {
      mockPrismaService.aboutPage.upsert.mockResolvedValue({
        id: 1,
        heroTitle: 'Nuevo Titulo',
        values: ['Innovacion'],
      });

      const result = await service.update({
        heroTitle: ' Nuevo Titulo ',
        values: ['Innovacion'],
      });

      expect(mockPrismaService.aboutPage.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          update: expect.objectContaining({
            heroTitle: 'Nuevo Titulo',
          }) as unknown,
        }),
      );
      expect(result.message).toContain('correctamente');
    });

    it('debe lanzar BadRequestException si values está vacío', async () => {
      await expect(
        service.update({
          values: ['   '],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe procesar imágenes con Cloudinary si se proporcionan archivos', async () => {
      const mockFile = {
        buffer: Buffer.from('test'),
        originalname: 'hero.png',
        mimetype: 'image/png',
      } as UploadedProductFile;

      mockCloudinaryService.uploadProductImages.mockResolvedValue([
        { imageUrl: 'https://cloudinary.com/hero.png' },
      ]);

      mockPrismaService.aboutPage.upsert.mockResolvedValue({
        id: 1,
        heroImageUrl: 'https://cloudinary.com/hero.png',
        values: ['Servicio'],
      });

      const result = await service.update({}, { heroImage: mockFile });
      expect(mockCloudinaryService.validateImageOperation).toHaveBeenCalled();
      expect(mockCloudinaryService.uploadProductImages).toHaveBeenCalled();
      expect(result.aboutPage?.heroImageUrl).toBe(
        'https://cloudinary.com/hero.png',
      );
    });
  });
});
