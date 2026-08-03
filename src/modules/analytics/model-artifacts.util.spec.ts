import {
  assignCustomerClusters,
  loadModelArtifacts,
  predictDemandFromArtifact,
  recommendationVector,
} from './model-artifacts.util';

describe('deployed model artifacts', () => {
  it('loads and executes the exported KMeans pipeline parameters', () => {
    const [assignment] = assignCustomerClusters([
      {
        completedSales: 3,
        validRentals: 1,
        amountSpentSales: 15888.9,
        amountSpentRentals: 2204.72,
        totalInteractions: 4,
        distinctProductsInteracted: 4,
        daysSinceLastActivity: 251,
      },
    ]);

    expect(assignment).toEqual({ clusterIndex: 0, code: 'C4' });
    expect(loadModelArtifacts().clustering.source_artifact).toBe(
      'clustering_clientes_pipeline.joblib',
    );
    expect(loadModelArtifacts().clusteringMetadata.batch_name).toBe(
      'CEMYDI_DEMO_2024_2026_V1',
    );
    expect(loadModelArtifacts().clusteringProfiles['0'].segmento).toBe(
      'Baja actividad',
    );
  });

  it('reproduces the Ridge JSON inference formula', () => {
    const month = 5;
    const prediction = predictDemandFromArtifact([
      Math.log1p(100),
      30,
      13,
      3,
      32,
      0,
      Math.sin((month / 12) * Math.PI * 2),
      Math.cos((month / 12) * Math.PI * 2),
      0,
      0,
      0,
    ]);

    expect(prediction).toBeCloseTo(22.9499632256717, 10);
  });

  it('keeps Ridge predictions above 200 when the artifact has no upper clip', () => {
    const prediction = predictDemandFromArtifact([
      Math.log1p(100),
      30,
      1000,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
    ]);

    expect(prediction).toBeGreaterThan(200);
  });

  it('uses the stored recommendation vector for a trained product', () => {
    const artifacts = loadModelArtifacts();
    const vector = recommendationVector({
      id: 179,
      classification: 'Movilidad',
      acquisitionType: 'MIXTO',
      price: 6164.07,
      stock: 29,
      views: 218,
      searches: 53,
      requiresPrescription: false,
    });

    expect(vector).toEqual(artifacts.recommendation.vectors[0]);
    expect(artifacts.recommendation.top_k).toBe(5);
    expect(artifacts.recommendationMetadata.final_metrics['HitRate@5']).toBe(
      0.27586206896551724,
    );
  });
});
