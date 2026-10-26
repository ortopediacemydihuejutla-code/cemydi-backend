import { Test, TestingModule } from '@nestjs/testing';
import { Rol } from '@prisma/client';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

describe('CartController', () => {
  let controller: CartController;

  const mockCartService = {
    getCart: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    applyCoupon: jest.fn(),
    removeCoupon: jest.fn(),
    removeItem: jest.fn(),
    clearRentals: jest.fn(),
    clearCart: jest.fn(),
  };

  const mockUser: AuthUser = {
    id: 10,
    correo: 'cliente@cemydi.com',
    nombre: 'Cliente',
    rol: Rol.CLIENT,
    activo: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CartController],
      providers: [{ provide: CartService, useValue: mockCartService }],
    }).compile();

    controller = module.get<CartController>(CartController);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar getCart al servicio', async () => {
    mockCartService.getCart.mockResolvedValue({ items: [], total: 0 });
    const result = await controller.getCart(mockUser);
    expect(mockCartService.getCart).toHaveBeenCalledWith(mockUser);
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('debe delegar addItem al servicio', async () => {
    const dto = { productId: 1, quantity: 2 };
    mockCartService.addItem.mockResolvedValue({ success: true });
    const result = await controller.addItem(mockUser, dto);
    expect(mockCartService.addItem).toHaveBeenCalledWith(mockUser, dto);
    expect(result).toEqual({ success: true });
  });

  it('debe delegar updateItem al servicio', async () => {
    const dto = { cantidad: 5 };
    mockCartService.updateItem.mockResolvedValue({ success: true });
    const result = await controller.updateItem(mockUser, 3, dto);
    expect(mockCartService.updateItem).toHaveBeenCalledWith(mockUser, 3, dto);
    expect(result).toEqual({ success: true });
  });

  it('debe delegar applyCoupon y removeCoupon al servicio', async () => {
    const couponDto = { code: 'PROMO10' };
    mockCartService.applyCoupon.mockResolvedValue({ applied: true });
    mockCartService.removeCoupon.mockResolvedValue({ removed: true });

    await controller.applyCoupon(mockUser, couponDto);
    expect(mockCartService.applyCoupon).toHaveBeenCalledWith(
      mockUser,
      couponDto,
    );

    await controller.removeCoupon(mockUser);
    expect(mockCartService.removeCoupon).toHaveBeenCalledWith(mockUser);
  });

  it('debe delegar removeItem y clearCart al servicio', async () => {
    mockCartService.removeItem.mockResolvedValue({ removed: true });
    mockCartService.clearCart.mockResolvedValue({ cleared: true });

    await controller.removeItem(mockUser, 5);
    expect(mockCartService.removeItem).toHaveBeenCalledWith(mockUser, 5);

    await controller.clearCart(mockUser);
    expect(mockCartService.clearCart).toHaveBeenCalledWith(mockUser);
  });
});
