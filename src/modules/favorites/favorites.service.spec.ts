import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { FavoritesService } from './favorites.service';

describe('FavoritesService', () => {
  let service: FavoritesService;
  const mockDelegate = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };

  const mockPrisma = {
    forUser: jest.fn().mockReturnValue({ favorite: mockDelegate }),
    product: {
      findFirst: jest.fn(),
    },
    favorite: mockDelegate,
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
      providers: [
        FavoritesService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<FavoritesService>(FavoritesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('rejects invalid product ID on add', async () => {
    await expect(service.add(user, 0)).rejects.toThrow(BadRequestException);
    await expect(service.add(user, -1)).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException if product does not exist or is inactive', async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);
    await expect(service.add(user, 99)).rejects.toThrow(NotFoundException);
  });

  it('adds favorite successfully if product exists', async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: 10 });
    mockDelegate.upsert.mockResolvedValue({});
    const res = await service.add(user, 10);
    expect(res.favorited).toBe(true);
    expect(res.productId).toBe(10);
  });

  it('removes favorite successfully', async () => {
    mockDelegate.deleteMany.mockResolvedValue({ count: 1 });
    const res = await service.remove(user, 10);
    expect(res.favorited).toBe(false);
    expect(res.productId).toBe(10);
  });

  it('toggles favorite from present to absent', async () => {
    mockDelegate.findUnique.mockResolvedValue({ id: 42 });
    mockDelegate.delete.mockResolvedValue({});
    const res = await service.toggle(user, 10);
    expect(res.favorited).toBe(false);
  });
});
