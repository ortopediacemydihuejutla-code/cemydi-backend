import { Test, TestingModule } from '@nestjs/testing';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminActivityService } from './admin-activity.service';

describe('AdminActivityService', () => {
  let service: AdminActivityService;

  const now = new Date();
  const mockPrismaService = {
    product: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    review: { findMany: jest.fn() },
    promotion: { findMany: jest.fn() },
    supplier: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminActivityService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AdminActivityService>(AdminActivityService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe consolidar actividades recientes ordenadas descendentemente por fecha', async () => {
    mockPrismaService.product.findMany.mockResolvedValue([
      {
        id: 1,
        nombre: 'Silla de Ruedas',
        createdAt: new Date(now.getTime() - 1000),
      },
    ]);
    mockPrismaService.user.findMany.mockResolvedValue([
      { id: 2, nombre: 'Juan', correo: 'juan@test.com', createdAt: now },
    ]);
    mockPrismaService.review.findMany.mockResolvedValue([
      {
        id: 3,
        status: ReviewStatus.PENDING,
        createdAt: new Date(now.getTime() - 2000),
        product: { nombre: 'Muletas' },
        user: { correo: 'pedro@test.com' },
      },
    ]);
    mockPrismaService.promotion.findMany.mockResolvedValue([
      {
        id: 4,
        descripcion: 'Descuento 10%',
        createdAt: new Date(now.getTime() - 3000),
        products: [],
        _count: { products: 0 },
      },
    ]);
    mockPrismaService.supplier.findMany.mockResolvedValue([
      {
        id: 5,
        nombre: 'Proveedor Medico',
        createdAt: new Date(now.getTime() - 4000),
      },
    ]);

    const result = await service.listRecent(10);
    expect(result.items).toHaveLength(5);
    expect(result.items[0].category).toBe('user');
    expect(result.items[1].category).toBe('product');
    expect(result.items[2].category).toBe('review');
    expect(result.items[2].title).toContain('Reseña pendiente');
  });
});
