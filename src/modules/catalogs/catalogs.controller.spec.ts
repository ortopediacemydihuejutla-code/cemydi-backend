import { Test, TestingModule } from '@nestjs/testing';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';

describe('CatalogsController', () => {
  let controller: CatalogsController;

  const mockCatalogsService = {
    findAll: jest.fn(),
    createBrand: jest.fn(),
    updateBrand: jest.fn(),
    deleteBrand: jest.fn(),
    createClassification: jest.fn(),
    updateClassification: jest.fn(),
    deleteClassification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogsController],
      providers: [{ provide: CatalogsService, useValue: mockCatalogsService }],
    }).compile();

    controller = module.get<CatalogsController>(CatalogsController);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar findAll al servicio', async () => {
    mockCatalogsService.findAll.mockResolvedValue({
      brands: [],
      classifications: [],
    });
    const result = await controller.findAll();
    expect(result).toEqual({ brands: [], classifications: [] });
  });

  it('debe manejar operaciones de marcas', async () => {
    const dto = { nombre: 'Marca' };
    mockCatalogsService.createBrand.mockResolvedValue({ message: 'creada' });
    mockCatalogsService.updateBrand.mockResolvedValue({
      message: 'actualizada',
    });
    mockCatalogsService.deleteBrand.mockResolvedValue({ message: 'eliminada' });

    await controller.createBrand(dto);
    expect(mockCatalogsService.createBrand).toHaveBeenCalledWith(dto);

    await controller.updateBrand(1, dto);
    expect(mockCatalogsService.updateBrand).toHaveBeenCalledWith(1, dto);

    await controller.updateBrandViaPost(1, dto);
    expect(mockCatalogsService.updateBrand).toHaveBeenCalledWith(1, dto);

    await controller.deleteBrand(1);
    expect(mockCatalogsService.deleteBrand).toHaveBeenCalledWith(1);
  });

  it('debe manejar operaciones de clasificaciones', async () => {
    const dto = { nombre: 'Clasificacion' };
    mockCatalogsService.createClassification.mockResolvedValue({
      message: 'creada',
    });
    mockCatalogsService.updateClassification.mockResolvedValue({
      message: 'actualizada',
    });
    mockCatalogsService.deleteClassification.mockResolvedValue({
      message: 'eliminada',
    });

    await controller.createClassification(dto);
    expect(mockCatalogsService.createClassification).toHaveBeenCalledWith(dto);

    await controller.updateClassification(2, dto);
    expect(mockCatalogsService.updateClassification).toHaveBeenCalledWith(
      2,
      dto,
    );

    await controller.deleteClassification(2);
    expect(mockCatalogsService.deleteClassification).toHaveBeenCalledWith(2);
  });
});
