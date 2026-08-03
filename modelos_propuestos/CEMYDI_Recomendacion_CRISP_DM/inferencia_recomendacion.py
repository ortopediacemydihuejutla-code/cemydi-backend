from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

ARTIFACT_DIR = Path("07_Modelos/recomendacion")

def cargar_artefactos():
    artifact = joblib.load(
        ARTIFACT_DIR / "recomendador_contenido.joblib"
    )
    matrix = np.load(
        ARTIFACT_DIR / "matriz_productos.npy"
    )
    catalog = pd.read_csv(
        ARTIFACT_DIR / "catalogo_recomendacion.csv"
    )
    return artifact, matrix, catalog

def recomendar_existente(
    product_id: int,
    top_k: int | None = None
) -> pd.DataFrame:
    artifact, matrix, catalog = cargar_artefactos()
    product_ids = artifact["product_ids"]
    k = top_k or artifact["top_k"]

    if product_id not in product_ids:
        raise ValueError(
            f"El producto {product_id} no existe "
            "en el artefacto."
        )

    index = product_ids.index(product_id)
    scores = cosine_similarity(
        matrix[index:index + 1],
        matrix
    )[0]

    order = np.argsort(-scores)

    positions = [
        position
        for position in order
        if product_ids[position] != product_id
    ][:k]

    result = catalog.iloc[positions].copy()
    result["similarity"] = [
        scores[position]
        for position in positions
    ]

    return result[
        [
            "product_id",
            "product_name",
            "classification",
            "acquisition_type",
            "price",
            "stock",
            "similarity",
        ]
    ]

def recomendar_nuevo(
    attributes: dict,
    top_k: int = 5
) -> pd.DataFrame:
    artifact, matrix, catalog = cargar_artefactos()

    categorical_columns = artifact[
        "categorical_columns"
    ]
    numeric_columns = artifact["numeric_columns"]
    binary_column = artifact["binary_column"]
    weights = artifact["weights"]

    required = (
        categorical_columns
        + numeric_columns
        + [binary_column]
    )

    missing = [
        column
        for column in required
        if column not in attributes
    ]

    if missing:
        raise ValueError(
            f"Faltan atributos: {missing}"
        )

    row = pd.DataFrame([attributes])

    categorical = artifact["encoder"].transform(
        row[categorical_columns]
    )

    numeric = artifact["scaler"].transform(
        np.log1p(
            row[numeric_columns].astype(float)
        )
    )

    binary = (
        row[[binary_column]]
        .astype(float)
        .to_numpy()
    )

    vector = np.hstack([
        categorical * weights["categoricas"],
        numeric * weights["numericas"],
        binary * weights["receta"],
    ])

    scores = cosine_similarity(
        vector,
        matrix
    )[0]

    positions = np.argsort(-scores)[:top_k]
    result = catalog.iloc[positions].copy()
    result["similarity"] = [
        scores[position]
        for position in positions
    ]

    return result[
        [
            "product_id",
            "product_name",
            "classification",
            "acquisition_type",
            "price",
            "stock",
            "similarity",
        ]
    ]

if __name__ == "__main__":
    print(recomendar_existente(179))
