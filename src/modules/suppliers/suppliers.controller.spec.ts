import { Test, TestingModule } from '@nestjs/testing';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

describe('SuppliersController', () => {
  let controller: SuppliersController;

  const mockSuppliersService = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuppliersController],
      providers: [
        { provide: SuppliersService, useValue: mockSuppliersService },
      ],
    }).compile();

    controller = module.get<SuppliersController>(SuppliersController);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar findAll al servicio', async () => {
    mockSuppliersService.findAll.mockResolvedValue({ suppliers: [] });
    const result = await controller.findAll();
    expect(result).toEqual({ suppliers: [] });
  });

  it('debe delegar create, update y delete al servicio', async () => {
    const dto = {
      nombre: 'Prov',
      encargado: 'Enc',
      repartidor: 'Rep',
      direccion: 'Dir',
    };
    mockSuppliersService.create.mockResolvedValue({ message: 'creado' });
    mockSuppliersService.update.mockResolvedValue({ message: 'actualizado' });
    mockSuppliersService.delete.mockResolvedValue({ message: 'eliminado' });

    await controller.create(dto);
    expect(mockSuppliersService.create).toHaveBeenCalledWith(dto);

    await controller.update(1, dto);
    expect(mockSuppliersService.update).toHaveBeenCalledWith(1, dto);

    await controller.delete(1);
    expect(mockSuppliersService.delete).toHaveBeenCalledWith(1);
  });
});
