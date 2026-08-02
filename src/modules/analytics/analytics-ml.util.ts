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

function compareVectors(a: number[], b: number[]) {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function initializeCentroids(vectors: number[][], k: number) {
  const first = [...vectors].sort((a, b) => {
    const distanceDifference =
      distanceSquared(a, Array<number>(a.length).fill(0)) -
      distanceSquared(b, Array<number>(b.length).fill(0));
    return distanceDifference || compareVectors(a, b);
  })[0];
  const centroids = [[...first]];

  while (centroids.length < k) {
    const candidate = [...vectors].sort((a, b) => {
      const nearestA = Math.min(
        ...centroids.map((centroid) => distanceSquared(a, centroid)),
      );
      const nearestB = Math.min(
        ...centroids.map((centroid) => distanceSquared(b, centroid)),
      );
      return nearestB - nearestA || compareVectors(a, b);
    })[0];
    centroids.push([...candidate]);
  }

  return centroids;
}

function permutations(values: number[]): number[][] {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, candidate) => candidate !== index)).map(
      (rest) => [value, ...rest],
    ),
  );
}

function mapClustersByCentroid(centroids: number[][]) {
  const roleScores = centroids.map((centroid) => ({
    buyer: centroid[0] + centroid[1],
    renter: centroid[2] + centroid[3],
    explorer: centroid[4] + centroid[5] - 0.25 * (centroid[0] + centroid[2]),
    lowActivity:
      centroid[6] -
      centroid[4] -
      centroid[5] -
      0.25 * (centroid[0] + centroid[2]),
  }));
  const candidates = permutations([0, 1, 2, 3]);
  const best = candidates.reduce(
    (currentBest, candidate) => {
      const score =
        roleScores[candidate[0]].buyer +
        roleScores[candidate[1]].renter +
        roleScores[candidate[2]].explorer +
        roleScores[candidate[3]].lowActivity;
      return score > currentBest.score
        ? { assignment: candidate, score }
        : currentBest;
    },
    {
      assignment: candidates[0],
      score: Number.NEGATIVE_INFINITY,
    },
  );

  return new Map<number, CustomerClusterCode>([
    [best.assignment[0], 'C1'],
    [best.assignment[1], 'C2'],
    [best.assignment[2], 'C3'],
    [best.assignment[3], 'C4'],
  ]);
}

export function clusterCustomers(rows: CustomerMetricRow[]) {
  if (rows.length < 4) {
    return rows.map((_, index) => ({
      clusterIndex: index,
      code: 'C4' as const,
    }));
  }

  const vectors = standardize(rows.map(customerVector));
  const centroids = initializeCentroids(vectors, 4);

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

  const codeByCluster = mapClustersByCentroid(centroids);

  return assignments.map((clusterIndex) => ({
    clusterIndex,
    code: codeByCluster.get(clusterIndex) ?? 'C4',
  }));
}

export type RegressionSample = {
  values: number[];
  target: number;
};

export type RegressionMetrics = {
  r2: number;
  mae: number;
  rmse: number;
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
  if (samples.length === 0) {
    throw new Error('Ridge regression requires at least one training sample.');
  }

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
  return { predict };
}

/** Calcula métricas exclusivamente sobre observaciones fuera del ajuste. */
export function calculateRegressionMetrics(
  actual: number[],
  predicted: number[],
): RegressionMetrics {
  if (actual.length === 0 || actual.length !== predicted.length) {
    throw new Error('Regression metrics require paired validation values.');
  }

  const targetMean =
    actual.reduce((sum, value) => sum + value, 0) / actual.length;
  const residual = actual.reduce(
    (sum, value, index) => sum + (value - predicted[index]) ** 2,
    0,
  );
  const total = actual.reduce(
    (sum, value) => sum + (value - targetMean) ** 2,
    0,
  );
  const mae =
    actual.reduce(
      (sum, value, index) => sum + Math.abs(value - predicted[index]),
      0,
    ) / actual.length;
  const rmse = Math.sqrt(residual / actual.length);
  const r2 = total === 0 ? 0 : 1 - residual / total;

  if (![r2, mae, rmse].every(Number.isFinite)) {
    throw new Error('Regression metrics must be finite values.');
  }

  return { r2, mae, rmse };
}
