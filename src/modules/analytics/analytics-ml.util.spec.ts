import {
  calculateRegressionMetrics,
  clusterCustomers,
  trainRidgeRegression,
  type CustomerMetricRow,
} from './analytics-ml.util';

describe('clusterCustomers', () => {
  const rows: CustomerMetricRow[] = [
    {
      completedSales: 14,
      amountSpentSales: 28000,
      validRentals: 1,
      amountSpentRentals: 500,
      totalInteractions: 30,
      distinctProductsInteracted: 12,
      daysSinceLastActivity: 2,
    },
    {
      completedSales: 12,
      amountSpentSales: 24000,
      validRentals: 0,
      amountSpentRentals: 0,
      totalInteractions: 26,
      distinctProductsInteracted: 10,
      daysSinceLastActivity: 4,
    },
    {
      completedSales: 1,
      amountSpentSales: 700,
      validRentals: 12,
      amountSpentRentals: 19000,
      totalInteractions: 28,
      distinctProductsInteracted: 9,
      daysSinceLastActivity: 3,
    },
    {
      completedSales: 0,
      amountSpentSales: 0,
      validRentals: 10,
      amountSpentRentals: 17000,
      totalInteractions: 24,
      distinctProductsInteracted: 8,
      daysSinceLastActivity: 5,
    },
    {
      completedSales: 0,
      amountSpentSales: 0,
      validRentals: 0,
      amountSpentRentals: 0,
      totalInteractions: 55,
      distinctProductsInteracted: 25,
      daysSinceLastActivity: 7,
    },
    {
      completedSales: 1,
      amountSpentSales: 300,
      validRentals: 0,
      amountSpentRentals: 0,
      totalInteractions: 48,
      distinctProductsInteracted: 22,
      daysSinceLastActivity: 9,
    },
    {
      completedSales: 0,
      amountSpentSales: 0,
      validRentals: 0,
      amountSpentRentals: 0,
      totalInteractions: 1,
      distinctProductsInteracted: 1,
      daysSinceLastActivity: 240,
    },
    {
      completedSales: 0,
      amountSpentSales: 0,
      validRentals: 0,
      amountSpentRentals: 0,
      totalInteractions: 2,
      distinctProductsInteracted: 1,
      daysSinceLastActivity: 180,
    },
  ];

  it('is reproducible when input order changes', () => {
    const original = clusterCustomers(rows).map(({ code }) => code);
    const reversed = clusterCustomers([...rows].reverse())
      .map(({ code }) => code)
      .reverse();

    expect(reversed).toEqual(original);
  });

  it('maps model clusters to their centroid meaning', () => {
    const assignments = clusterCustomers(rows).map(({ code }) => code);

    expect(assignments[0]).toBe('C1');
    expect(assignments[2]).toBe('C2');
    expect(assignments[4]).toBe('C3');
    expect(assignments[6]).toBe('C4');
  });
});

describe('Ridge regression', () => {
  it('calculates metrics from a separate validation set', () => {
    const model = trainRidgeRegression([
      { values: [0], target: 1 },
      { values: [1], target: 3 },
      { values: [2], target: 5 },
    ]);
    const actual = [7, 9];
    const predicted = [[3], [4]].map((values) => model.predict(values));
    const metrics = calculateRegressionMetrics(actual, predicted);

    expect(metrics.mae).toBeGreaterThanOrEqual(0);
    expect(metrics.rmse).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(metrics.r2)).toBe(true);
    expect(Number.isFinite(metrics.mae)).toBe(true);
    expect(Number.isFinite(metrics.rmse)).toBe(true);
  });

  it('calculates RMSE for a controlled case', () => {
    const metrics = calculateRegressionMetrics([1, 2], [2, 4]);

    expect(metrics.rmse).toBeCloseTo(Math.sqrt(2.5), 10);
  });

  it('rejects empty metric inputs', () => {
    expect(() => calculateRegressionMetrics([], [])).toThrow(
      'paired validation values',
    );
  });

  it('rejects metric inputs with different lengths', () => {
    expect(() => calculateRegressionMetrics([1], [1, 2])).toThrow(
      'paired validation values',
    );
  });

  it('rejects non-finite metric results', () => {
    expect(() =>
      calculateRegressionMetrics([1, Number.POSITIVE_INFINITY], [1, 2]),
    ).toThrow('finite values');
  });
});
