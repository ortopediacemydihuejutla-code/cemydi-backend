ALTER TABLE "catalog"."products" ADD COLUMN "slug" TEXT;

WITH product_slugs AS (
  SELECT
    "id",
    COALESCE(
      NULLIF(
        trim(BOTH '-' FROM regexp_replace(
          lower(translate("nombre", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
          '[^a-z0-9]+',
          '-',
          'g'
        )),
        ''
      ),
      'producto'
    ) AS base_slug
  FROM "catalog"."products"
), numbered_slugs AS (
  SELECT
    "id",
    base_slug,
    row_number() OVER (PARTITION BY base_slug ORDER BY "id") AS slug_number
  FROM product_slugs
)
UPDATE "catalog"."products" AS product
SET "slug" = CASE
  WHEN numbered_slugs.slug_number = 1 THEN numbered_slugs.base_slug
  ELSE numbered_slugs.base_slug || '-' || numbered_slugs.slug_number
END
FROM numbered_slugs
WHERE product."id" = numbered_slugs."id";

ALTER TABLE "catalog"."products" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "products_slug_key" ON "catalog"."products"("slug");
