import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

const demandRows = [
  {
    product_id: 7,
    product_name: 'Producto de prueba',
    classification: 'MOVILIDAD',
    acquisition_type: 'VENTA',
    month: new Date('2026-01-01T00:00:00.000Z'),
    month_number: 1,
    monthly_demand: 10,
    units_sold: 8,
    units_rented: 1,
    views: 20,
    unit_price: 100,
    stock_at_month_start: 30,
    active_promotion: false,
    requires_prescription: false,
    previous_month_sales: 7,
    previous_month_rentals: 0,
    previous_month_views: 18,
  },
  {
    product_id: 7,
    product_name: 'Producto de prueba',
    classification: 'MOVILIDAD',
    acquisition_type: 'VENTA',
    month: new Date('2026-02-01T00:00:00.000Z'),
    month_number: 2,
    monthly_demand: 12,
    units_sold: 9,
    units_rented: 2,
    views: 24,
    unit_price: 100,
    stock_at_month_start: 30,
    active_promotion: false,
    requires_prescription: false,
    previous_month_sales: 8,
    previous_month_rentals: 1,
    previous_month_views: 20,
  },
  {
    product_id: 7,
    product_name: 'Producto de prueba',
    classification: 'MOVILIDAD',
    acquisition_type: 'VENTA',
    month: new Date('2026-03-01T00:00:00.000Z'),
    month_number: 3,
    monthly_demand: 14,
    units_sold: 11,
    units_rented: 2,
    views: 28,
    unit_price: 100,
    stock_at_month_start: 30,
    active_promotion: false,
    requires_prescription: false,
    previous_month_sales: 9,
    previous_month_rentals: 2,
    previous_month_views: 24,
  },
  {
    product_id: 7,
    product_name: 'Producto de prueba',
    classification: 'MOVILIDAD',
    acquisition_type: 'VENTA',
    month: new Date('2026-04-01T00:00:00.000Z'),
    month_number: 4,
    monthly_demand: 16,
    units_sold: 13,
    units_rented: 3,
    views: 32,
    unit_price: 100,
    stock_at_month_start: 30,
    active_promotion: false,
    requires_prescription: false,
    previous_month_sales: 11,
    previous_month_rentals: 2,
    previous_month_views: 28,
  },
];

describe('AnalyticsService demand forecast', () => {
  const queryRaw = jest.fn();
  const productFindMany = jest.fn();
  const promotionFindMany = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
    product: { findMany: productFindMany },
    promotion: { findMany: promotionFindMany },
  } as unknown as PrismaService;
  const service = new AnalyticsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    productFindMany.mockResolvedValue([
      {
        id: 7,
        nombre: 'Producto de prueba',
        clasificacion: 'MOVILIDAD',
        tipoAdquisicion: 'VENTA',
        precio: 100,
        stock: 30,
        activo: true,
        requiereReceta: false,
      },
    ]);
    promotionFindMany.mockResolvedValue([]);
  });

  it('reports the evaluation metadata stored with the deployed artifact', async () => {
    queryRaw.mockResolvedValue(demandRows);

    const result = await service.getDemandForecast();

    expect(result.model.artifact).toBe('ridge_demanda_modelo.json');
    expect(result.model.version).toBe('1.0');
    expect(result.model.historicalRows).toBe(1240);
    expect(result.model.trainingRows).toBe(1000);
    expect(result.model.validationRows).toBe(240);
    expect(result.model.finalTrainingRows).toBe(1240);
    expect(result.model.trainingRows + result.model.validationRows).toBe(
      result.model.historicalRows,
    );
    expect(result.model.historicalThrough).toBe('2026-07');
    expect(result.model.validationFrom).toBe('2026-02');
    expect(result.model.validationTo).toBe('2026-07');
    expect(Number.isFinite(result.model.r2)).toBe(true);
    expect(Number.isFinite(result.model.mae)).toBe(true);
    expect(Number.isFinite(result.model.rmse)).toBe(true);
  });

  it('exposes the latest historical values as the previous-month inputs', async () => {
    queryRaw.mockResolvedValue(demandRows);

    const result = await service.getDemandForecast();

    expect(result.forecasts[0]).toEqual(
      expect.objectContaining({
        previousMonthSales: 13,
        previousMonthRentals: 3,
        previousMonthViews: 32,
      }),
    );
  });

  it('returns every model field when the dataset is empty', async () => {
    queryRaw.mockResolvedValue([]);

    const result = await service.getDemandForecast();

    expect(result.model).toEqual({
      name: 'Predicción mensual de demanda CEMYDI',
      version: '1.0',
      artifact: 'ridge_demanda_modelo.json',
      historicalRows: 0,
      trainingRows: 0,
      validationRows: 0,
      finalTrainingRows: 0,
      validationMonths: 0,
      products: 0,
      historicalMonths: 0,
      r2: 0,
      mae: 0,
      rmse: 0,
      forecastMonth: null,
      historicalThrough: null,
      validationFrom: null,
      validationTo: null,
    });
    expect(result.forecasts).toEqual([]);
  });
});
