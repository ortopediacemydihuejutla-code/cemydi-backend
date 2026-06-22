import { Injectable } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AnalyticsQueryDto } from './dto/analytics-query.dto';

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Rango [from, to] inclusivo en instantes reales. */
function rollingRange(days: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from, to };
}

function enumerateUtcDateKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let t = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const endT = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (t <= endT) {
    keys.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return keys;
}

function bucketByDate<T extends { createdAt: Date }>(
  rows: T[],
  dateKeys: string[],
): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (const k of dateKeys) {
    map.set(k, 0);
  }
  for (const row of rows) {
    const k = utcDateKey(row.createdAt);
    if (map.has(k)) {
      map.set(k, (map.get(k) ?? 0) + 1);
    }
  }
  return dateKeys.map((date) => ({ date, count: map.get(date) ?? 0 }));
}

function countFromGroup(row: { _count?: { _all: number } | null }): number {
  return row._count?._all ?? 0;
}

function bucketByLastSeen<T extends { lastSeenAt: Date }>(
  rows: T[],
  dateKeys: string[],
): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (const k of dateKeys) {
    map.set(k, 0);
  }
  for (const row of rows) {
    const k = utcDateKey(row.lastSeenAt);
    if (map.has(k)) {
      map.set(k, (map.get(k) ?? 0) + 1);
    }
  }
  return dateKeys.map((date) => ({ date, count: map.get(date) ?? 0 }));
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(query: AnalyticsQueryDto) {
    const days = query.days;
    const { from, to } = rollingRange(days);
    const dateKeys = enumerateUtcDateKeys(from, to);

    const now = new Date();

    const [
      productsActive,
      productsLowStock,
      reviewsInRange,
      reviewsPending,
      promotionsActive,
      newUsersInRange,
      sessionsTouches,
      reviewsApprovedInRange,
      usersForSeries,
      reviewsForSeries,
      sessionsForSeries,
      classifications,
      reviewsByRating,
      reviewsByStatus,
      topReviewGroups,
    ] = await Promise.all([
      this.prisma.product.count({ where: { activo: true } }),
      this.prisma.product.count({
        where: { activo: true, stock: { lt: 5 } },
      }),
      this.prisma.review.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.review.count({
        where: { status: ReviewStatus.PENDING },
      }),
      this.prisma.promotion.count({
        where: {
          startAt: { lte: now },
          endAt: { gte: now },
          product: { activo: true, stock: { gt: 0 } },
        },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.userSession.count({
        where: { lastSeenAt: { gte: from, lte: to } },
      }),
      this.prisma.review.count({
        where: {
          status: ReviewStatus.APPROVED,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      this.prisma.review.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true },
      }),
      this.prisma.userSession.findMany({
        where: { lastSeenAt: { gte: from, lte: to } },
        select: { lastSeenAt: true },
      }),
      this.prisma.product.groupBy({
        by: ['clasificacion'],
        where: { activo: true },
        _count: { _all: true },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { status: ReviewStatus.APPROVED },
        _count: { _all: true },
        orderBy: { rating: 'asc' },
      }),
      this.prisma.review.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.review.groupBy({
        by: ['productId'],
        where: {
          status: ReviewStatus.APPROVED,
          createdAt: { gte: from, lte: to },
        },
        _count: { _all: true },
      }),
    ]);

    const topReviewSorted = [...topReviewGroups].sort(
      (a, b) => countFromGroup(b) - countFromGroup(a),
    );
    const topFive = topReviewSorted.slice(0, 5);

    const productIds = topFive.map((g) => g.productId);
    const products =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, nombre: true },
          })
        : [];
    const nameById = new Map(products.map((p) => [p.id, p.nombre]));

    const topProducts = topFive.map((g) => ({
      productId: g.productId,
      nombre: nameById.get(g.productId) ?? `#${g.productId}`,
      reviewCount: countFromGroup(g),
    }));

    return {
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
        days,
      },
      notes: [
        'No hay modelo de pedidos/ventas: ingresos y embudo de compra no están disponibles aún.',
        'La actividad de sesión cuenta filas en user_sessions con lastSeenAt en el rango.',
      ],
      kpis: {
        productsActive,
        productsLowStock,
        reviewsTotalInRange: reviewsInRange,
        reviewsPending,
        reviewsApprovedInRange,
        promotionsActive,
        newUsersInRange,
        sessionActivityEvents: sessionsTouches,
      },
      series: {
        registrationsByDay: bucketByDate(usersForSeries, dateKeys),
        reviewsByDay: bucketByDate(reviewsForSeries, dateKeys),
        sessionActivityByDay: bucketByLastSeen(sessionsForSeries, dateKeys),
      },
      distributions: {
        productsByClassification: [...classifications]
          .sort((a, b) => countFromGroup(b) - countFromGroup(a))
          .map((row) => ({
            clasificacion: row.clasificacion,
            count: countFromGroup(row),
          })),
        reviewsByRating: reviewsByRating.map((row) => ({
          rating: row.rating,
          count: countFromGroup(row),
        })),
        reviewsByStatus: reviewsByStatus.map((row) => ({
          status: row.status,
          count: countFromGroup(row),
        })),
      },
      topProductsByReviewsInRange: topProducts,
    };
  }
}
