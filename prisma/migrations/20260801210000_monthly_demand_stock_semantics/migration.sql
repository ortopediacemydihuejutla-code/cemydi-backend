-- El snapshot se captura al inicio de cada mes. El nombre anterior permitía
-- confundirlo con el inventario vigente del catálogo durante el pronóstico.
-- Algunos entornos ya tienen el nombre nuevo. Validar antes de renombrar para
-- conservar ambos estados históricos sin eliminar ni recrear la vista.
DO $migration$
DECLARE
  has_legacy boolean;
  has_current boolean;
BEGIN
  IF to_regclass('analytics.v_dataset_monthly_demand') IS NULL THEN
    RAISE EXCEPTION 'Falta analytics.v_dataset_monthly_demand; revisar su creación antes de migrar';
  END IF;

  SELECT
    COALESCE(bool_or(attname = 'stock_available'), false),
    COALESCE(bool_or(attname = 'stock_at_month_start'), false)
  INTO has_legacy, has_current
  FROM pg_attribute
  WHERE attrelid = 'analytics.v_dataset_monthly_demand'::regclass
    AND attnum > 0 AND NOT attisdropped;

  IF has_legacy AND NOT has_current THEN
    ALTER VIEW analytics.v_dataset_monthly_demand
      RENAME COLUMN stock_available TO stock_at_month_start;
  ELSIF NOT has_current OR has_legacy THEN
    RAISE EXCEPTION 'Contrato de stock ambiguo o ausente en analytics.v_dataset_monthly_demand; no se modificó la vista';
  END IF;

  COMMENT ON COLUMN analytics.v_dataset_monthly_demand.stock_at_month_start IS
    'Inventario disponible al inicio del mes histórico; característica causal del modelo, no stock vigente.';
END;
$migration$;
