import { Injectable } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AnalyticsQueryDto } from './dto/analytics-query.dto';
import {
  clusterCustomers,
  trainRidgeRegression,
  type CustomerClusterCode,
} from './analytics-ml.util';

type CustomerDatasetRow = {
  customer_id: number;
  customer_name: string;
  email: string;
  views: number;
  searches: number;
  add_to_cart: number;
  favorites: number;
  shares: number;
  distinct_products_interacted: number;
  total_interactions: number;
  completed_sales: number;
  units_purchased: number;
  amount_spent_sales: number;
  valid_rentals: number;
  units_rented: number;
  amount_spent_rentals: number;
  average_rental_days: number;
  days_since_last_activity: number;
  average_monthly_activity: number;
  interests: string[];
};

type DemandDatasetRow = {
  product_id: number;
  product_name: string;
  classification: string;
  acquisition_type: string;
  month: Date;
  month_number: number;
  monthly_demand: number;
  units_sold: number;
  units_rented: number;
  views: number;
  unit_price: number;
  stock_available: number;
  active_promotion: boolean;
  requires_prescription: boolean;
  previous_month_sales: number;
  previous_month_rentals: number;
  previous_month_views: number;
};

const clusterDefinitions: Record<
  CustomerClusterCode,
  { name: string; description: string; action: string; color: string }
> = {
  C1: {
    name: 'Compradores frecuentes',
    description: 'Clientes con compras recurrentes y alto valor acumulado.',
    action: 'Ofrecer recompensas, preventas y paquetes de recompra.',
    color: '#0ea5e9',
  },
  C2: {
    name: 'Arrendatarios recurrentes',
    description: 'Clientes que utilizan la renta como solución habitual.',
    action: 'Proponer renovaciones, mantenimiento y planes de renta extendida.',
    color: '#8b5cf6',
  },
  C3: {
    name: 'Exploradores',
    description:
      'Clientes con muchas consultas e interés, aún con baja conversión.',
    action:
      'Enviar orientación por categoría y recordatorios de productos vistos.',
    color: '#10b981',
  },
  C4: {
    name: 'Baja actividad',
    description: 'Clientes con poca interacción o una ausencia prolongada.',
    action: 'Activar campañas de reencuentro con un incentivo sencillo.',
    color: '#f59e0b',
  },
};

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

  async getCustomerSegmentation() {
    const rows = await this.prisma.$queryRaw<CustomerDatasetRow[]>`
      SELECT v.*,
        COALESCE((
          SELECT array_agg(ranked.classification ORDER BY ranked.interactions DESC)
          FROM (
            SELECT p.clasificacion AS classification, count(*) AS interactions
            FROM analytics.customer_product_interactions i
            JOIN catalog.products p ON p.id = i."productId"
            WHERE i."userId" = v.customer_id
              AND i."batchName" = 'CEMYDI_DEMO_VARIANCE_V2'
            GROUP BY p.clasificacion
            ORDER BY count(*) DESC
            LIMIT 2
          ) ranked
        ), ARRAY[]::text[]) AS interests
      FROM analytics.v_dataset_customer_clustering v
      ORDER BY v.customer_id
    `;

    const assignments = clusterCustomers(
      rows.map((row) => ({
        completedSales: row.completed_sales,
        amountSpentSales: row.amount_spent_sales,
        validRentals: row.valid_rentals,
        amountSpentRentals: row.amount_spent_rentals,
        totalInteractions: row.total_interactions,
        distinctProductsInteracted: row.distinct_products_interacted,
        daysSinceLastActivity: row.days_since_last_activity,
      })),
    );

    const maxInteractions = Math.max(
      ...rows.map((row) => row.total_interactions),
      1,
    );
    const maxValue = Math.max(
      ...rows.map((row) => row.amount_spent_sales + row.amount_spent_rentals),
      1,
    );
    const customers = rows.map((row, index) => ({
      id: row.customer_id,
      name: row.customer_name,
      email: row.email,
      cluster: assignments[index].code,
      views: row.views,
      searches: row.searches,
      consultations: row.total_interactions,
      distinctProducts: row.distinct_products_interacted,
      completedSales: row.completed_sales,
      unitsPurchased: row.units_purchased,
      validRentals: row.valid_rentals,
      unitsRented: row.units_rented,
      salesSpend: row.amount_spent_sales,
      rentalSpend: row.amount_spent_rentals,
      totalSpend: row.amount_spent_sales + row.amount_spent_rentals,
      averageRentalDays: row.average_rental_days,
      daysSinceLastActivity: row.days_since_last_activity,
      averageMonthlyActivity: row.average_monthly_activity,
      interests: row.interests,
      engagementScore: Math.round(
        (row.total_interactions / maxInteractions) * 100,
      ),
      valueScore: Math.round(
        ((row.amount_spent_sales + row.amount_spent_rentals) / maxValue) * 100,
      ),
    }));

    const clusters = (
      Object.keys(clusterDefinitions) as CustomerClusterCode[]
    ).map((code) => {
      const members = customers.filter((customer) => customer.cluster === code);
      const average = (
        selector: (customer: (typeof customers)[number]) => number,
      ) =>
        members.reduce((sum, customer) => sum + selector(customer), 0) /
        Math.max(1, members.length);
      return {
        code,
        ...clusterDefinitions[code],
        count: members.length,
        percentage: Number(
          ((members.length / customers.length) * 100).toFixed(1),
        ),
        averages: {
          sales: Number(
            average((customer) => customer.completedSales).toFixed(1),
          ),
          rentals: Number(
            average((customer) => customer.validRentals).toFixed(1),
          ),
          consultations: Number(
            average((customer) => customer.consultations).toFixed(1),
          ),
          spend: Number(average((customer) => customer.totalSpend).toFixed(2)),
        },
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      method: 'K-means (k=4) con variables estandarizadas',
      sourceRows: rows.length,
      clusters,
      customers,
    };
  }

  async getDemandForecast() {
    const rows = await this.prisma.$queryRaw<DemandDatasetRow[]>`
      SELECT product_id, product_name, classification, acquisition_type, month,
        month_number, monthly_demand, units_sold, units_rented, views, unit_price,
        stock_available, active_promotion, requires_prescription,
        previous_month_sales, previous_month_rentals, previous_month_views
      FROM analytics.v_dataset_monthly_demand
      ORDER BY product_id, month
    `;
    const featureValues = (
      row: DemandDatasetRow,
      forecastMonth = row.month_number,
    ) => [
      Math.log1p(row.unit_price),
      row.stock_available,
      row.previous_month_sales,
      row.previous_month_rentals,
      row.previous_month_views,
      row.active_promotion ? 1 : 0,
      Math.sin((forecastMonth / 12) * Math.PI * 2),
      Math.cos((forecastMonth / 12) * Math.PI * 2),
      row.requires_prescription ? 1 : 0,
      row.acquisition_type === 'RENTA' ? 1 : 0,
      row.acquisition_type === 'MIXTO' ? 1 : 0,
    ];
    const model = trainRidgeRegression(
      rows.map((row) => ({
        values: featureValues(row),
        target: row.monthly_demand,
      })),
    );
    const latestMonth = rows.reduce(
      (latest, row) => (row.month > latest ? row.month : latest),
      rows[0]?.month ?? new Date(),
    );
    const forecastDate = new Date(
      Date.UTC(latestMonth.getUTCFullYear(), latestMonth.getUTCMonth() + 1, 1),
    );
    const forecastMonth = forecastDate.getUTCMonth() + 1;
    const latestRows = rows.filter(
      (row) => row.month.getTime() === latestMonth.getTime(),
    );
    const promotionRows = await this.prisma.promotion.findMany({
      where: {
        startAt: {
          lte: new Date(
            Date.UTC(
              forecastDate.getUTCFullYear(),
              forecastMonth,
              0,
              23,
              59,
              59,
            ),
          ),
        },
        endAt: { gte: forecastDate },
      },
      select: { productId: true },
    });
    const promoted = new Set(
      promotionRows.map((promotion) => promotion.productId),
    );
    const forecasts = latestRows.map((row) => {
      const input: DemandDatasetRow = {
        ...row,
        previous_month_sales: row.units_sold,
        previous_month_rentals: row.units_rented,
        previous_month_views: row.views,
        active_promotion: promoted.has(row.product_id),
      };
      const predictedDemand = Math.max(
        0,
        Math.min(
          200,
          Math.round(model.predict(featureValues(input, forecastMonth))),
        ),
      );
      const shortage = predictedDemand - row.stock_available;
      const recommendation =
        shortage >= 10
          ? `Priorizar la reposición de ${shortage} unidades.`
          : shortage > 0
            ? `Programar una compra preventiva de ${shortage} unidades.`
            : shortage === 0
              ? 'Monitorear la rotación antes de reponer.'
              : 'Mantener el inventario y revisar la rotación mensual.';
      return {
        id: row.product_id,
        productName: row.product_name,
        shortName:
          row.product_name.length > 24
            ? `${row.product_name.slice(0, 23).trim()}…`
            : row.product_name,
        classification: row.classification,
        acquisitionType: row.acquisition_type,
        price: row.unit_price,
        currentStock: row.stock_available,
        month: forecastMonth,
        previousMonthSales: row.units_sold,
        previousMonthRentals: row.units_rented,
        previousMonthViews: row.views,
        activePromotion: input.active_promotion,
        predictedDemand,
        recommendation,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      model: {
        name: 'Regresión lineal múltiple Ridge',
        trainingRows: rows.length,
        products: forecasts.length,
        historicalMonths: new Set(
          rows.map((row) => row.month.toISOString().slice(0, 7)),
        ).size,
        r2: Number(model.r2.toFixed(3)),
        mae: Number(model.mae.toFixed(2)),
        forecastMonth: forecastDate.toISOString().slice(0, 7),
      },
      forecasts: forecasts.sort(
        (a, b) => b.predictedDemand - a.predictedDemand,
      ),
    };
  }
}
