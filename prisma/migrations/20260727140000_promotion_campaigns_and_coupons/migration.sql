-- Promotion campaigns can target any explicit combination of products.
CREATE TYPE "management"."PromotionImageStrategy" AS ENUM ('AUTO', 'CUSTOM');

ALTER TABLE "management"."promotions"
ADD COLUMN "imageStrategy" "management"."PromotionImageStrategy" NOT NULL DEFAULT 'AUTO',
ADD COLUMN "imageCloudinaryPublicId" TEXT;

CREATE TABLE "management"."promotion_products" (
    "promotionId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    CONSTRAINT "promotion_products_pkey" PRIMARY KEY ("promotionId", "productId")
);

INSERT INTO "management"."promotion_products" ("promotionId", "productId")
SELECT "id", "productId"
FROM "management"."promotions";

ALTER TABLE "management"."promotion_products"
ADD CONSTRAINT "promotion_products_promotionId_fkey"
FOREIGN KEY ("promotionId") REFERENCES "management"."promotions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "management"."promotion_products"
ADD CONSTRAINT "promotion_products_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "catalog"."products"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "promotion_products_productId_idx"
ON "management"."promotion_products"("productId");

ALTER TABLE "management"."promotions"
DROP CONSTRAINT "promotions_productId_fkey";

DROP INDEX IF EXISTS "management"."promotions_productId_idx";

ALTER TABLE "management"."promotions"
DROP COLUMN "productId";

-- Coupons are cart-level discounts managed independently from campaigns.
CREATE TYPE "management"."CouponDiscountType" AS ENUM ('PERCENT', 'FIXED');

CREATE TABLE "management"."coupons" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "discountType" "management"."CouponDiscountType" NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "minimumPurchase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maximumDiscount" DOUBLE PRECISION,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "coupons_discountValue_check" CHECK ("discountValue" > 0),
    CONSTRAINT "coupons_minimumPurchase_check" CHECK ("minimumPurchase" >= 0),
    CONSTRAINT "coupons_maximumDiscount_check" CHECK ("maximumDiscount" IS NULL OR "maximumDiscount" > 0),
    CONSTRAINT "coupons_usageLimit_check" CHECK ("usageLimit" IS NULL OR "usageLimit" > 0)
);

CREATE UNIQUE INDEX "coupons_code_key"
ON "management"."coupons"("code");

CREATE INDEX "coupons_active_startAt_endAt_idx"
ON "management"."coupons"("active", "startAt", "endAt");

ALTER TABLE "accounts"."shopping_carts"
ADD COLUMN "couponId" INTEGER;

CREATE INDEX "shopping_carts_couponId_idx"
ON "accounts"."shopping_carts"("couponId");

ALTER TABLE "accounts"."shopping_carts"
ADD CONSTRAINT "shopping_carts_couponId_fkey"
FOREIGN KEY ("couponId") REFERENCES "management"."coupons"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
