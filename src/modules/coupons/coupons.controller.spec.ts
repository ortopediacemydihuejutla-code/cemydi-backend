import { Test, TestingModule } from '@nestjs/testing';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { CouponDiscountTypeInput } from './dto/create-coupon.dto';

describe('CouponsController', () => {
  let controller: CouponsController;

  const mockCouponsService = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CouponsController],
      providers: [{ provide: CouponsService, useValue: mockCouponsService }],
    }).compile();

    controller = module.get<CouponsController>(CouponsController);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar findAll al servicio', async () => {
    mockCouponsService.findAll.mockResolvedValue({ coupons: [] });
    const result = await controller.findAll();
    expect(result).toEqual({ coupons: [] });
  });

  it('debe delegar create, update y remove al servicio', async () => {
    const dto = {
      code: 'SALE',
      description: 'Descuento de prueba',
      discountType: CouponDiscountTypeInput.PERCENT,
      discountValue: 10,
      minimumPurchase: 0,
      startAt: '2026-10-01T00:00:00.000Z',
      endAt: '2026-10-31T00:00:00.000Z',
      active: true,
    };
    mockCouponsService.create.mockResolvedValue({ message: 'creado' });
    mockCouponsService.update.mockResolvedValue({ message: 'actualizado' });
    mockCouponsService.remove.mockResolvedValue({ message: 'eliminado' });

    await controller.create(dto);
    expect(mockCouponsService.create).toHaveBeenCalledWith(dto);

    await controller.update(1, dto);
    expect(mockCouponsService.update).toHaveBeenCalledWith(1, dto);

    await controller.remove(1);
    expect(mockCouponsService.remove).toHaveBeenCalledWith(1);
  });
});
