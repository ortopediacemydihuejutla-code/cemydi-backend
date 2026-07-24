export type CustomerMetricRow = {
  completedSales: number;
  amountSpentSales: number;
  validRentals: number;
  amountSpentRentals: number;
  totalInteractions: number;
  distinctProductsInteracted: number;
  daysSinceLastActivity: number;
};

export type CustomerClusterCode = 'C1' | 'C2' | 'C3' | 'C4';

function distanceSquared(a: number[], b: number[]) {
  return a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);
}

function customerVector(row: CustomerMetricRow) {
  return [
    Math.log1p(row.completedSales),
    Math.log1p(row.amountSpentSales),
    Math.log1p(row.validRentals),
    Math.log1p(row.amountSpentRentals),
    Math.log1p(row.totalInteractions),
    Math.log1p(row.distinctProductsInteracted),
    Math.log1p(row.daysSinceLastActivity),
  ];
}

function standardize(vectors: number[][]) {
  const width = vectors[0]?.length ?? 0;
  const means = Array.from(
    { length: width },
    (_, column) =>
      vectors.reduce((sum, row) => sum + row[column], 0) / vectors.length,
  );
  const deviations = means.map((mean, column) => {
    const variance =
      vectors.reduce((sum, row) => sum + (row[column] - mean) ** 2, 0) /
      vectors.length;
    return Math.sqrt(variance) || 1;
  });

  return vectors.map((row) =>
    row.map((value, column) => (value - means[column]) / deviations[column]),
  );
}

export function clusterCustomers(rows: CustomerMetricRow[]) {
  if (rows.length < 4) {
    return rows.map((_, index) => ({
      clusterIndex: index,
      code: 'C4' as const,
    }));
  }

  const vectors = standardize(rows.map(customerVector));
  const centroids: number[][] = [vectors[0]];
  while (centroids.length < 4) {
    let farthestIndex = 0;
    let farthestDistance = -1;
    vectors.forEach((vector, index) => {
      const nearest = Math.min(
        ...centroids.map((centroid) => distanceSquared(vector, centroid)),
      );
      if (nearest > farthestDistance) {
        farthestDistance = nearest;
        farthestIndex = index;
      }
    });
    centroids.push([...vectors[farthestIndex]]);
  }

  let assignments = Array(rows.length).fill(0) as number[];
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const next = vectors.map((vector) => {
      const distances = centroids.map((centroid) =>
        distanceSquared(vector, centroid),
      );
      return distances.indexOf(Math.min(...distances));
    });
    const unchanged = next.every(
      (value, index) => value === assignments[index],
    );
    assignments = next;

    for (let cluster = 0; cluster < 4; cluster += 1) {
      const members = vectors.filter(
        (_, index) => assignments[index] === cluster,
      );
      if (members.length === 0) continue;
      centroids[cluster] = centroids[cluster].map(
        (_, column) =>
          members.reduce((sum, row) => sum + row[column], 0) / members.length,
      );
    }
    if (unchanged && iteration > 0) break;
  }

  const averages = Array.from({ length: 4 }, (_, cluster) => {
    const members = rows.filter((_, index) => assignments[index] === cluster);
    const average = (selector: (row: CustomerMetricRow) => number) =>
      members.reduce((sum, row) => sum + selector(row), 0) /
      Math.max(1, members.length);
    return {
      cluster,
      sales: average((row) => row.completedSales),
      salesAmount: average((row) => row.amountSpentSales),
      rentals: average((row) => row.validRentals),
      rentalAmount: average((row) => row.amountSpentRentals),
      interactions: average((row) => row.totalInteractions),
      inactivity: average((row) => row.daysSinceLastActivity),
    };
  });

  const remaining = new Set([0, 1, 2, 3]);
  const buyers = [...remaining].sort(
    (a, b) =>
      averages[b].sales +
      Math.log1p(averages[b].salesAmount) -
      averages[a].sales -
      Math.log1p(averages[a].salesAmount),
  )[0];
  remaining.delete(buyers);
  const renters = [...remaining].sort(
    (a, b) =>
      averages[b].rentals +
      Math.log1p(averages[b].rentalAmount) -
      averages[a].rentals -
      Math.log1p(averages[a].rentalAmount),
  )[0];
  remaining.delete(renters);
  const lowActivity = [...remaining].sort(
    (a, b) =>
      averages[b].inactivity -
      averages[b].interactions * 0.25 -
      (averages[a].inactivity - averages[a].interactions * 0.25),
  )[0];
  remaining.delete(lowActivity);
  const explorers = [...remaining][0];

  const codeByCluster = new Map<number, CustomerClusterCode>([
    [buyers, 'C1'],
    [renters, 'C2'],
    [explorers, 'C3'],
    [lowActivity, 'C4'],
  ]);

  return assignments.map((clusterIndex) => ({
    clusterIndex,
    code: codeByCluster.get(clusterIndex) ?? 'C4',
  }));
}

export type RegressionSample = {
  values: number[];
  target: number;
};

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (
        Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])
      ) {
        pivot = row;
      }
    }
    [augmented[column], augmented[pivot]] = [
      augmented[pivot],
      augmented[column],
    ];
    const divisor = augmented[column][column] || 1e-9;
    augmented[column] = augmented[column].map((value) => value / divisor);
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      augmented[row] = augmented[row].map(
        (value, index) => value - factor * augmented[column][index],
      );
    }
  }
  return augmented.map((row) => row[n]);
}

export function trainRidgeRegression(samples: RegressionSample[], ridge = 0.8) {
  const featureCount = samples[0]?.values.length ?? 0;
  const means = Array.from(
    { length: featureCount },
    (_, column) =>
      samples.reduce((sum, sample) => sum + sample.values[column], 0) /
      samples.length,
  );
  const deviations = means.map((mean, column) => {
    const variance =
      samples.reduce(
        (sum, sample) => sum + (sample.values[column] - mean) ** 2,
        0,
      ) / samples.length;
    return Math.sqrt(variance) || 1;
  });
  const design = samples.map((sample) => [
    1,
    ...sample.values.map(
      (value, column) => (value - means[column]) / deviations[column],
    ),
  ]);
  const width = featureCount + 1;
  const xtx = Array.from({ length: width }, (_, row) =>
    Array.from({ length: width }, (_, column) =>
      design.reduce((sum, values) => sum + values[row] * values[column], 0),
    ),
  );
  for (let index = 1; index < width; index += 1) xtx[index][index] += ridge;
  const xty = Array.from({ length: width }, (_, column) =>
    samples.reduce(
      (sum, sample, index) => sum + design[index][column] * sample.target,
      0,
    ),
  );
  const coefficients = solveLinearSystem(xtx, xty);
  const predict = (values: number[]) =>
    coefficients[0] +
    values.reduce(
      (sum, value, column) =>
        sum +
        coefficients[column + 1] *
          ((value - means[column]) / deviations[column]),
      0,
    );
  const predictions = samples.map((sample) => predict(sample.values));
  const targetMean =
    samples.reduce((sum, sample) => sum + sample.target, 0) / samples.length;
  const residual = samples.reduce(
    (sum, sample, index) => sum + (sample.target - predictions[index]) ** 2,
    0,
  );
  const total = samples.reduce(
    (sum, sample) => sum + (sample.target - targetMean) ** 2,
    0,
  );
  const mae =
    samples.reduce(
      (sum, sample, index) =>
        sum + Math.abs(sample.target - predictions[index]),
      0,
    ) / samples.length;
  return { predict, r2: total === 0 ? 0 : 1 - residual / total, mae };
}
