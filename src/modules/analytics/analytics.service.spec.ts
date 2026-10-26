import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';
import { ReviewStatus } from '@prisma/client';

describe('AnalyticsService getDashboard', () => {
  const prisma = {
    product: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    review: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    promotion: {
      count: jest.fn(),
    },
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    userSession: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const service = new AnalyticsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calculates dashboard operational KPIs and distributions correctly', async () => {
    (prisma.product.count as jest.Mock)
      .mockResolvedValueOnce(57) // productsActive
      .mockResolvedValueOnce(3); // productsLowStock

    (prisma.review.count as jest.Mock)
      .mockResolvedValueOnce(4) // reviewsTotalInRange
      .mockResolvedValueOnce(0) // reviewsPending
      .mockResolvedValueOnce(4); // reviewsApprovedInRange

    (prisma.promotion.count as jest.Mock).mockResolvedValueOnce(2); // promotionsActive
    (prisma.user.count as jest.Mock).mockResolvedValueOnce(11); // newUsersInRange
    (prisma.userSession.count as jest.Mock).mockResolvedValueOnce(25); // sessionActivityEvents

    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.review.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.userSession.findMany as jest.Mock).mockResolvedValueOnce([]);

    (prisma.product.groupBy as jest.Mock).mockResolvedValueOnce([
      { clasificacion: 'MOVILIDAD', _count: { _all: 20 } },
    ]);
    (prisma.review.groupBy as jest.Mock)
      .mockResolvedValueOnce([{ rating: 5, _count: { _all: 4 } }])
      .mockResolvedValueOnce([
        { status: ReviewStatus.APPROVED, _count: { _all: 4 } },
      ])
      .mockResolvedValueOnce([{ productId: 57, _count: { _all: 2 } }]);

    (prisma.product.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 57, nombre: 'Silla de ruedas estándar' },
    ]);

    const result = await service.getDashboard({ days: 30 });

    expect(result.kpis.productsActive).toBe(57);
    expect(result.kpis.productsLowStock).toBe(3);
    expect(result.kpis.reviewsTotalInRange).toBe(4);
    expect(result.kpis.reviewsPending).toBe(0);
    expect(result.kpis.reviewsApprovedInRange).toBe(4);
    expect(result.kpis.promotionsActive).toBe(2);
    expect(result.kpis.newUsersInRange).toBe(11);
    expect(result.kpis.sessionActivityEvents).toBe(25);

    expect(result.distributions.productsByClassification).toEqual([
      { clasificacion: 'MOVILIDAD', count: 20 },
    ]);
    expect(result.topProductsByReviewsInRange).toEqual([
      { productId: 57, nombre: 'Silla de ruedas estándar', reviewCount: 2 },
    ]);
  });
});
