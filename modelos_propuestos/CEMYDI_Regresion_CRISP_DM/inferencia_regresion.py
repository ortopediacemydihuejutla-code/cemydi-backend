from pathlib import Path
import json

import numpy as np
import pandas as pd

MODEL_PATH = Path(
    "07_Modelos/regresion/ridge_demanda_modelo.json"
)

def construir_variables(
    dataframe: pd.DataFrame,
    feature_names: list[str]
) -> pd.DataFrame:
    resultado = pd.DataFrame(index=dataframe.index)

    resultado["log_unit_price"] = np.log1p(
        dataframe["unit_price"]
    )
    resultado["stock_at_month_start"] = (
        dataframe["stock_at_month_start"]
    )
    resultado["previous_month_sales"] = (
        dataframe["previous_month_sales"]
    )
    resultado["previous_month_rentals"] = (
        dataframe["previous_month_rentals"]
    )
    resultado["previous_month_views"] = (
        dataframe["previous_month_views"]
    )
    resultado["active_promotion"] = (
        dataframe["active_promotion"].astype(int)
    )

    angulo = (
        dataframe["month_number"] / 12
    ) * 2 * np.pi
    resultado["month_sin"] = np.sin(angulo)
    resultado["month_cos"] = np.cos(angulo)

    resultado["requires_prescription"] = (
        dataframe["requires_prescription"].astype(int)
    )
    resultado["acquisition_renta"] = (
        dataframe["acquisition_type"]
        .eq("RENTA")
        .astype(int)
    )
    resultado["acquisition_mixto"] = (
        dataframe["acquisition_type"]
        .eq("MIXTO")
        .astype(int)
    )

    return resultado[feature_names]

def cargar_modelo(
    path: Path = MODEL_PATH
) -> dict:
    if not path.exists():
        raise FileNotFoundError(
            f"No se encontró el modelo: {path}"
        )

    return json.loads(
        path.read_text(encoding="utf-8")
    )

def predecir(
    dataframe: pd.DataFrame,
    artifact: dict
) -> np.ndarray:
    X = construir_variables(
        dataframe,
        artifact["feature_names"]
    ).to_numpy(dtype=float)

    mean = np.asarray(
        artifact["scaler_mean"],
        dtype=float
    )
    scale = np.asarray(
        artifact["scaler_scale"],
        dtype=float
    )
    coefficients = np.asarray(
        artifact["coefficients"],
        dtype=float
    )
    intercept = float(artifact["intercept"])

    X_scaled = (X - mean) / scale
    prediction = (
        intercept + X_scaled @ coefficients
    )

    return np.maximum(prediction, 0)

if __name__ == "__main__":
    print(
        "Este módulo carga ridge_demanda_modelo.json. "
        "La predicción decimal se limita únicamente a cero. "
        "El redondeo debe aplicarse en la interfaz."
    )
