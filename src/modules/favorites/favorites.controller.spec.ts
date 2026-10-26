import { Test, TestingModule } from '@nestjs/testing';
import { Rol } from '@prisma/client';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

describe('FavoritesController', () => {
  let controller: FavoritesController;
  const mockService = {
    listMine: jest.fn(),
    listMyIds: jest.fn(),
    toggle: jest.fn(),
    add: jest.fn(),
    remove: jest.fn(),
  };

  const user: AuthUser = {
    id: 1,
    nombre: 'Juan Perez',
    correo: 'juan@example.com',
    rol: Rol.CLIENT,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FavoritesController],
      providers: [
        {
          provide: FavoritesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<FavoritesController>(FavoritesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates listMine to service', async () => {
    mockService.listMine.mockResolvedValue({
      products: [],
      favoriteIds: [],
      total: 0,
    });
    const result = await controller.listMine(user);
    expect(mockService.listMine).toHaveBeenCalledWith(user);
    expect(result.total).toBe(0);
  });

  it('delegates listMyIds to service', async () => {
    mockService.listMyIds.mockResolvedValue({ favoriteIds: [1, 2] });
    const result = await controller.listMyIds(user);
    expect(mockService.listMyIds).toHaveBeenCalledWith(user);
    expect(result.favoriteIds).toEqual([1, 2]);
  });

  it('delegates toggle to service', async () => {
    mockService.toggle.mockResolvedValue({
      message: 'Agregado',
      favorited: true,
      productId: 5,
    });
    const result = await controller.toggle(user, 5);
    expect(mockService.toggle).toHaveBeenCalledWith(user, 5);
    expect(result.favorited).toBe(true);
  });

  it('delegates add to service', async () => {
    mockService.add.mockResolvedValue({
      message: 'Agregado',
      favorited: true,
      productId: 5,
    });
    const result = await controller.add(user, 5);
    expect(mockService.add).toHaveBeenCalledWith(user, 5);
    expect(result.favorited).toBe(true);
  });

  it('delegates remove to service', async () => {
    mockService.remove.mockResolvedValue({
      message: 'Eliminado',
      favorited: false,
      productId: 5,
    });
    const result = await controller.remove(user, 5);
    expect(mockService.remove).toHaveBeenCalledWith(user, 5);
    expect(result.favorited).toBe(false);
  });
});
