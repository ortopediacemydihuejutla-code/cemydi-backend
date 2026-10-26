import { Test, TestingModule } from '@nestjs/testing';
import { LegalDocumentsController } from './legal-documents.controller';
import { LegalDocumentsService } from './legal-documents.service';

describe('LegalDocumentsController', () => {
  let controller: LegalDocumentsController;

  const mockLegalDocumentsService = {
    getPublicContent: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LegalDocumentsController],
      providers: [
        {
          provide: LegalDocumentsService,
          useValue: mockLegalDocumentsService,
        },
      ],
    }).compile();

    controller = module.get<LegalDocumentsController>(LegalDocumentsController);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar getPublicContent al servicio', async () => {
    mockLegalDocumentsService.getPublicContent.mockResolvedValue({
      document: { id: 1 },
    });
    const result = await controller.getPublicContent('terminos-y-condiciones');
    expect(mockLegalDocumentsService.getPublicContent).toHaveBeenCalledWith(
      'terminos-y-condiciones',
    );
    expect(result).toEqual({ document: { id: 1 } });
  });

  it('debe delegar update al servicio', async () => {
    const dto = { title: 'Nuevo Titulo' };
    mockLegalDocumentsService.update.mockResolvedValue({
      message: 'Actualizado',
    });
    const result = await controller.update('terminos-y-condiciones', dto);
    expect(mockLegalDocumentsService.update).toHaveBeenCalledWith(
      'terminos-y-condiciones',
      dto,
    );
    expect(result).toEqual({ message: 'Actualizado' });
  });
});
