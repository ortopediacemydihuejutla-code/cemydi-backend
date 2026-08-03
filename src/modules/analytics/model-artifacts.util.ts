import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type {
  CustomerClusterCode,
  CustomerMetricRow,
} from './analytics-ml.util';

type ClusteringArtifact = {
  model_type: 'KMeans';
  version: string;
  feature_names: string[];
  scaler_mean: number[];
  scaler_scale: number[];
  cluster_centers: number[][];
  cluster_codes: CustomerClusterCode[];
  source_artifact: string;
};

type ClusteringMetadata = {
  solucion: string;
  batch_name: string;
  fecha_corte: string;
  fecha_entrenamiento: string;
  registros: number;
  variables: string[];
  transformaciones: string[];
  algoritmo: string;
  parametros: {
    k: number;
    n_init: number;
    random_state: number;
  };
  metricas: {
    inercia: number;
    silhouette: number;
    davies_bouldin: number;
    calinski_harabasz: number;
  };
};

type ClusteringProfile = {
  segmento: string;
  interpretacion: string;
  accion_sugerida: string;
  perfil_promedio: Record<string, number>;
};

export type RegressionArtifact = {
  model_type: 'Ridge';
  alpha: number;
  feature_names: string[];
  scaler_mean: number[];
  scaler_scale: number[];
  coefficients: number[];
  intercept: number;
  clip_min: number;
  clip_max?: number | null;
};

type RegressionMetadata = {
  name: string;
  version: string;
  historical_from: string;
  historical_through: string;
  historical_months: number;
  products: number;
  historical_rows: number;
  forecast_month: string;
};

type RegressionMetrics = {
  training_period: { from: string; to: string; rows: number };
  validation_period: { from: string; to: string; rows: number };
  ridge: { alpha: number; r2: number; mae: number; rmse: number };
};

export type RecommendationArtifact = {
  model_type: 'content_based_cosine_similarity';
  top_k: number;
  product_ids: number[];
  product_names: string[];
  vectors: number[][];
  categorical_columns: string[];
  categorical_categories: [string[], string[]];
  numeric_columns: string[];
  numeric_mean: number[];
  numeric_scale: number[];
  binary_column: string;
  weights: { categoricas: number; numericas: number; receta: number };
};

type RecommendationMetadata = {
  name: string;
  version: string;
  batch_name: string;
  technique: string;
  top_k: number;
  final_metrics: Record<string, number>;
};

type ModelArtifacts = {
  clustering: ClusteringArtifact;
  clusteringMetadata: ClusteringMetadata;
  clusteringProfiles: Record<string, ClusteringProfile>;
  regression: RegressionArtifact;
  regressionMetadata: RegressionMetadata;
  regressionMetrics: RegressionMetrics;
  recommendation: RecommendationArtifact;
  recommendationMetadata: RecommendationMetadata;
};

let cachedArtifacts: ModelArtifacts | undefined;

function modelRoot() {
  if (process.env.CEMYDI_MODEL_DIR)
    return resolve(process.env.CEMYDI_MODEL_DIR);
  const candidates = [
    join(process.cwd(), 'modelos_propuestos'),
    join(process.cwd(), 'cemydi-backend', 'modelos_propuestos'),
  ];
  return resolve(
    candidates.find((candidate) => existsSync(candidate)) ?? candidates[0],
  );
}

function readJson<T>(...segments: string[]): T {
  const path = join(modelRoot(), ...segments);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function loadModelArtifacts(): ModelArtifacts {
  if (cachedArtifacts) return cachedArtifacts;

  cachedArtifacts = {
    clustering: readJson(
      'CEMYDI_Clustering_CRISP_DM',
      '07_Modelos',
      'clustering',
      'clustering_clientes_modelo.json',
    ),
    clusteringMetadata: readJson(
      'CEMYDI_Clustering_CRISP_DM',
      '07_Modelos',
      'clustering',
      'metadata_clustering.json',
    ),
    clusteringProfiles: readJson(
      'CEMYDI_Clustering_CRISP_DM',
      '07_Modelos',
      'clustering',
      'perfiles_segmentos.json',
    ),
    regression: readJson(
      'CEMYDI_Regresion_CRISP_DM',
      '07_Modelos',
      'regresion',
      'ridge_demanda_modelo.json',
    ),
    regressionMetadata: readJson(
      'CEMYDI_Regresion_CRISP_DM',
      '07_Modelos',
      'regresion',
      'metadata_regresion.json',
    ),
    regressionMetrics: readJson(
      'CEMYDI_Regresion_CRISP_DM',
      '07_Modelos',
      'regresion',
      'metricas_regresion.json',
    ),
    recommendation: readJson(
      'CEMYDI_Recomendacion_CRISP_DM',
      '07_Modelos',
      'recomendacion',
      'recomendador_contenido.json',
    ),
    recommendationMetadata: readJson(
      'CEMYDI_Recomendacion_CRISP_DM',
      '07_Modelos',
      'recomendacion',
      'metadata_recomendacion.json',
    ),
  };
  return cachedArtifacts;
}

function distanceSquared(left: number[], right: number[]) {
  return left.reduce(
    (sum, value, index) => sum + (value - right[index]) ** 2,
    0,
  );
}

export function assignCustomerClusters(rows: CustomerMetricRow[]) {
  const { clustering } = loadModelArtifacts();
  return rows.map((row) => {
    const values = [
      row.completedSales,
      row.validRentals,
      row.amountSpentSales,
      row.amountSpentRentals,
      row.totalInteractions,
      row.distinctProductsInteracted,
      row.daysSinceLastActivity,
    ];
    const vector = values.map(
      (value, index) =>
        (Math.log1p(Math.max(0, value)) - clustering.scaler_mean[index]) /
        clustering.scaler_scale[index],
    );
    const distances = clustering.cluster_centers.map((center) =>
      distanceSquared(vector, center),
    );
    const clusterIndex = distances.indexOf(Math.min(...distances));
    return { clusterIndex, code: clustering.cluster_codes[clusterIndex] };
  });
}

export function predictDemandFromArtifact(values: number[]) {
  const { regression } = loadModelArtifacts();
  if (values.length !== regression.feature_names.length) {
    throw new Error(
      'La entrada no coincide con las variables del modelo Ridge.',
    );
  }
  const prediction = values.reduce(
    (result, value, index) =>
      result +
      regression.coefficients[index] *
        ((value - regression.scaler_mean[index]) /
          regression.scaler_scale[index]),
    regression.intercept,
  );
  const lower = Math.max(regression.clip_min, prediction);
  return typeof regression.clip_max === 'number'
    ? Math.min(regression.clip_max, lower)
    : lower;
}

export function cosineSimilarity(left: number[], right: number[]) {
  const dot = left.reduce((sum, value, index) => sum + value * right[index], 0);
  const leftNorm = Math.sqrt(left.reduce((sum, value) => sum + value ** 2, 0));
  const rightNorm = Math.sqrt(
    right.reduce((sum, value) => sum + value ** 2, 0),
  );
  return leftNorm && rightNorm ? dot / (leftNorm * rightNorm) : 0;
}

export type RecommendationProductInput = {
  id: number;
  classification: string;
  acquisitionType: string;
  price: number;
  stock: number;
  views: number;
  searches: number;
  requiresPrescription: boolean;
};

export function recommendationVector(input: RecommendationProductInput) {
  const { recommendation } = loadModelArtifacts();
  const artifactIndex = recommendation.product_ids.indexOf(input.id);
  if (artifactIndex >= 0) return recommendation.vectors[artifactIndex];

  const [classifications, acquisitionTypes] =
    recommendation.categorical_categories;
  const categorical = [
    ...classifications.map((value) =>
      value.localeCompare(input.classification, 'es', {
        sensitivity: 'base',
      }) === 0
        ? recommendation.weights.categoricas
        : 0,
    ),
    ...acquisitionTypes.map((value) =>
      value === input.acquisitionType ? recommendation.weights.categoricas : 0,
    ),
  ];
  const numericValues = [input.price, input.stock, input.views, input.searches];
  const numeric = numericValues.map(
    (value, index) =>
      ((Math.log1p(Math.max(0, value)) - recommendation.numeric_mean[index]) /
        recommendation.numeric_scale[index]) *
      recommendation.weights.numericas,
  );
  return [
    ...categorical,
    ...numeric,
    input.requiresPrescription ? recommendation.weights.receta : 0,
  ];
}
