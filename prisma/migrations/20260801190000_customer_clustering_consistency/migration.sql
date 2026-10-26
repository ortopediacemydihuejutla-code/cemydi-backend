-- PostgreSQL preserves a view's column contract by position, not just by name.
-- Keep each environment's existing column order and append only missing columns.
-- This replaces the query without dropping the view, grants, dependencies or data.
DO $migration$
DECLARE
  expected_columns text[] := ARRAY[
    'customer_id', 'customer_name', 'email', 'views', 'searches',
    'add_to_cart', 'favorites', 'shares', 'distinct_products_interacted',
    'total_interactions', 'completed_sales', 'units_purchased',
    'amount_spent_sales', 'valid_rentals', 'units_rented',
    'amount_spent_rentals', 'average_rental_days', 'last_activity',
    'days_since_last_activity', 'average_monthly_activity'
  ];
  existing_columns text[];
  projection_columns text[];
  projection text;
BEGIN
  SELECT COALESCE(array_agg(attname::text ORDER BY attnum), ARRAY[]::text[])
  INTO existing_columns
  FROM pg_attribute
  WHERE attrelid = to_regclass('analytics.v_dataset_customer_clustering')
    AND attnum > 0
    AND NOT attisdropped;

  IF EXISTS (
    SELECT 1 FROM unnest(existing_columns) AS column_name
    WHERE NOT (column_name = ANY(expected_columns))
  ) THEN
    RAISE EXCEPTION 'Unexpected columns in analytics.v_dataset_customer_clustering; inspect the view before migrating';
  END IF;

  projection_columns := existing_columns || ARRAY(
    SELECT column_name FROM unnest(expected_columns) AS column_name
    WHERE NOT (column_name = ANY(existing_columns))
  );
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal)
  INTO projection
  FROM unnest(projection_columns) WITH ORDINALITY AS columns(column_name, ordinal);

  EXECUTE format(
    'CREATE OR REPLACE VIEW analytics.v_dataset_customer_clustering AS SELECT %s FROM (%s) AS corrected_dataset',
    projection,
    $query$
WITH interaction_summary AS (
  SELECT
    i."userId",
    count(*) FILTER (WHERE i."interactionType" = 'VIEW') AS views,
    count(*) FILTER (WHERE i."interactionType" = 'SEARCH') AS searches,
    count(*) FILTER (WHERE i."interactionType" = 'ADD_TO_CART') AS add_to_cart,
    count(*) FILTER (WHERE i."interactionType" = 'FAVORITE') AS favorites,
    count(*) FILTER (WHERE i."interactionType" = 'SHARE') AS shares,
    count(DISTINCT i."productId") AS distinct_products_interacted,
    min(i."occurredAt") AS first_interaction,
    max(i."occurredAt") AS last_interaction,
    count(*) AS total_interactions
  FROM analytics.customer_product_interactions i
  WHERE i."batchName" = 'CEMYDI_DEMO_2024_2026_V1'
  GROUP BY i."userId"
),
sales_summary AS (
  SELECT
    so."userId",
    count(*) FILTER (WHERE so.status = 'COMPLETED') AS completed_sales,
    COALESCE(sum(so.total) FILTER (WHERE so.status = 'COMPLETED'), 0) AS amount_spent_sales,
    max(so."orderDate") FILTER (WHERE so.status = 'COMPLETED') AS last_sale
  FROM management.sales_orders so
  WHERE so."batchName" = 'CEMYDI_DEMO_2024_2026_V1'
  GROUP BY so."userId"
),
sales_units AS (
  SELECT
    so."userId",
    COALESCE(sum(soi.quantity) FILTER (WHERE so.status = 'COMPLETED'), 0) AS units_purchased
  FROM management.sales_orders so
  LEFT JOIN management.sales_order_items soi ON soi."salesOrderId" = so.id
  WHERE so."batchName" = 'CEMYDI_DEMO_2024_2026_V1'
  GROUP BY so."userId"
),
rental_summary AS (
  SELECT
    rr."userId",
    count(*) FILTER (
      WHERE rr.status IN ('APPROVED', 'DELIVERED', 'RETURNED')
    ) AS valid_rentals,
    COALESCE(sum(rr.subtotal) FILTER (
      WHERE rr.status IN ('APPROVED', 'DELIVERED', 'RETURNED')
    ), 0) AS amount_spent_rentals,
    max(
      CASE rr.status
        WHEN 'APPROVED' THEN COALESCE(rr."approvedAt", rr."statusUpdatedAt", rr."createdAt")
        WHEN 'DELIVERED' THEN COALESCE(rr."deliveredAt", rr."statusUpdatedAt", rr."createdAt")
        WHEN 'RETURNED' THEN COALESCE(rr."returnedAt", rr."statusUpdatedAt", rr."createdAt")
        ELSE NULL
      END
    ) AS last_rental
  FROM management.rental_requests rr
  WHERE rr.id LIKE 'demo-rental-%'
  GROUP BY rr."userId"
),
rental_units AS (
  SELECT
    rr."userId",
    COALESCE(sum(rri.quantity) FILTER (
      WHERE rr.status IN ('APPROVED', 'DELIVERED', 'RETURNED')
    ), 0) AS units_rented,
    COALESCE(avg(rri.days) FILTER (
      WHERE rr.status IN ('APPROVED', 'DELIVERED', 'RETURNED')
    ), 0) AS average_rental_days
  FROM management.rental_requests rr
  LEFT JOIN management.rental_request_items rri ON rri."rentalRequestId" = rr.id
  WHERE rr.id LIKE 'demo-rental-%'
  GROUP BY rr."userId"
),
customer_base AS (
  SELECT
    u.id AS customer_id,
    u.nombre AS customer_name,
    u.correo AS email,
    COALESCE(i.views, 0)::integer AS views,
    COALESCE(i.searches, 0)::integer AS searches,
    COALESCE(i.add_to_cart, 0)::integer AS add_to_cart,
    COALESCE(i.favorites, 0)::integer AS favorites,
    COALESCE(i.shares, 0)::integer AS shares,
    COALESCE(i.distinct_products_interacted, 0)::integer AS distinct_products_interacted,
    COALESCE(i.total_interactions, 0)::integer AS total_interactions,
    COALESCE(s.completed_sales, 0)::integer AS completed_sales,
    COALESCE(su.units_purchased, 0)::integer AS units_purchased,
    round(COALESCE(s.amount_spent_sales, 0), 2)::double precision AS amount_spent_sales,
    COALESCE(r.valid_rentals, 0)::integer AS valid_rentals,
    COALESCE(ru.units_rented, 0)::integer AS units_rented,
    round(COALESCE(r.amount_spent_rentals, 0)::numeric, 2)::double precision AS amount_spent_rentals,
    round(COALESCE(ru.average_rental_days, 0), 2)::double precision AS average_rental_days,
    GREATEST(i.last_interaction, s.last_sale, r.last_rental) AS last_activity,
    CASE
      WHEN i.first_interaction IS NULL THEN 0
      ELSE GREATEST(
        1,
        (
          EXTRACT(YEAR FROM age(date_trunc('month', i.last_interaction), date_trunc('month', i.first_interaction))) * 12
          + EXTRACT(MONTH FROM age(date_trunc('month', i.last_interaction), date_trunc('month', i.first_interaction)))
        )::integer
      )
    END AS active_interaction_months
  FROM accounts.users u
  LEFT JOIN interaction_summary i ON i."userId" = u.id
  LEFT JOIN sales_summary s ON s."userId" = u.id
  LEFT JOIN sales_units su ON su."userId" = u.id
  LEFT JOIN rental_summary r ON r."userId" = u.id
  LEFT JOIN rental_units ru ON ru."userId" = u.id
  WHERE u.correo LIKE 'demo.usuario%@cemydi.local'
)
SELECT
  customer_id,
  customer_name,
  email,
  views,
  searches,
  add_to_cart,
  favorites,
  shares,
  distinct_products_interacted,
  total_interactions,
  completed_sales,
  units_purchased,
  amount_spent_sales,
  valid_rentals,
  units_rented,
  amount_spent_rentals,
  average_rental_days,
  CASE
    WHEN last_activity IS NULL THEN 365
    ELSE LEAST(365, GREATEST(0, CURRENT_DATE - last_activity::date))
  END AS days_since_last_activity,
  CASE
    WHEN active_interaction_months = 0 THEN 0::double precision
    ELSE round(total_interactions::numeric / active_interaction_months, 2)::double precision
  END AS average_monthly_activity,
  last_activity
FROM customer_base
$query$
  );
END;
$migration$;
