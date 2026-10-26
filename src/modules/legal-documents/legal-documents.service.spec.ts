import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { LegalDocumentsService } from './legal-documents.service';

describe('LegalDocumentsService', () => {
  let service: LegalDocumentsService;

  const mockPrismaService = {
    asReader: jest.fn().mockReturnThis(),
    legalDocument: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegalDocumentsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<LegalDocumentsService>(LegalDocumentsService);
    jest.clearAllMocks();
    mockPrismaService.asReader.mockReturnValue(mockPrismaService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('getPublicContent', () => {
    it('debe retornar documento por defecto si no existe en BD', async () => {
      mockPrismaService.legalDocument.findUnique.mockResolvedValue(null);
      const result = await service.getPublicContent('terminos-y-condiciones');
      expect(result.document).toBeDefined();
      expect(result.document.slug).toBe('terminos-y-condiciones');
      expect(result.document.sections.length).toBeGreaterThan(0);
    });

    it('debe lanzar BadRequestException si el slug no es válido', async () => {
      await expect(
        service.getPublicContent('documento-inexistente-invalido'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe serializar documento existente de BD', async () => {
      mockPrismaService.legalDocument.findUnique.mockResolvedValue({
        id: 1,
        slug: 'politicas-de-privacidad',
        title: 'Política de privacidad',
        description: 'Descripcion',
        sections: { fields: {}, customSections: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getPublicContent('politicas-de-privacidad');
      expect(result.document.title).toBe('Política de privacidad');
    });
  });

  describe('update', () => {
    it('debe actualizar y retornar el documento modificado', async () => {
      mockPrismaService.legalDocument.findUnique.mockResolvedValue(null);
      mockPrismaService.legalDocument.upsert.mockResolvedValue({
        id: 1,
        slug: 'terminos-y-condiciones',
        title: 'Términos Nuevos',
        description: 'Desc',
        sections: { fields: {}, customSections: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.update('terminos-y-condiciones', {
        title: 'Términos Nuevos',
      });
      expect(result.message).toContain('correctamente');
      expect(result.document.title).toBe('Términos Nuevos');
    });
  });
});
