from pathlib import Path
import json

import joblib


ARTIFACT_DIR = Path(__file__).parent / "07_Modelos" / "clustering"
PIPELINE_PATH = ARTIFACT_DIR / "clustering_clientes_pipeline.joblib"
OUTPUT_PATH = ARTIFACT_DIR / "clustering_clientes_modelo.json"


def exportar() -> Path:
    pipeline = joblib.load(PIPELINE_PATH)
    scaler = pipeline.named_steps["escalado"]
    kmeans = pipeline.named_steps["kmeans"]
    artifact = {
        "model_type": "KMeans",
        "version": "1.0",
        "feature_names": [
            "completed_sales",
            "valid_rentals",
            "amount_spent_sales",
            "amount_spent_rentals",
            "total_interactions",
            "distinct_products_interacted",
            "days_since_last_activity",
        ],
        "transform": "log1p_then_standard_scaler",
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
        "cluster_centers": kmeans.cluster_centers_.tolist(),
        "cluster_codes": ["C4", "C1", "C2", "C3"],
        "source_artifact": PIPELINE_PATH.name,
    }
    OUTPUT_PATH.write_text(
        json.dumps(artifact, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return OUTPUT_PATH


if __name__ == "__main__":
    print(exportar())
