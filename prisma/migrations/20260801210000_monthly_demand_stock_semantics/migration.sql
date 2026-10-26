-- El snapshot se captura al inicio de cada mes. El nombre anterior permitía
-- confundirlo con el inventario vigente del catálogo durante el pronóstico.
ALTER VIEW analytics.v_dataset_monthly_demand
  RENAME COLUMN stock_available TO stock_at_month_start;

COMMENT ON COLUMN analytics.v_dataset_monthly_demand.stock_at_month_start IS
  'Inventario disponible al inicio del mes histórico; característica causal del modelo, no stock vigente.';
