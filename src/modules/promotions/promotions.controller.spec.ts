import { Test, TestingModule } from '@nestjs/testing';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { PromotionImageStrategyInput } from './dto/create-promotion.dto';

describe('PromotionsController', () => {
  let controller: PromotionsController;

  const mockPromotionsService = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromotionsController],
      providers: [
        { provide: PromotionsService, useValue: mockPromotionsService },
      ],
    }).compile();

    controller = module.get<PromotionsController>(PromotionsController);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar findAll al servicio con includeExpired', async () => {
    mockPromotionsService.findAll.mockResolvedValue({ promotions: [] });
    const result = await controller.findAll('true', undefined);
    expect(mockPromotionsService.findAll).toHaveBeenCalledWith({
      includeExpired: true,
      user: undefined,
    });
    expect(result).toEqual({ promotions: [] });
  });

  it('debe delegar create, update y remove al servicio', async () => {
    const dto = {
      descripcion: 'Promoción de prueba',
      productIds: '1',
      discountPercent: 10,
      imageStrategy: PromotionImageStrategyInput.AUTO,
      startAt: '2026-10-01T00:00:00.000Z',
      endAt: '2026-10-31T00:00:00.000Z',
    };
    mockPromotionsService.create.mockResolvedValue({ message: 'creada' });
    mockPromotionsService.update.mockResolvedValue({ message: 'actualizada' });
    mockPromotionsService.remove.mockResolvedValue({ message: 'eliminada' });

    await controller.create(dto, undefined);
    expect(mockPromotionsService.create).toHaveBeenCalledWith(dto, undefined);

    await controller.update(1, dto, undefined);
    expect(mockPromotionsService.update).toHaveBeenCalledWith(
      1,
      dto,
      undefined,
    );

    await controller.remove(1);
    expect(mockPromotionsService.remove).toHaveBeenCalledWith(1);
  });
});
