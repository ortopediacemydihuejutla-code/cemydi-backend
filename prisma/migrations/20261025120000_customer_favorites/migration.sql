BEGIN;

CREATE TABLE "accounts"."favorites" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_favorites_user_product" ON "accounts"."favorites"("userId", "productId");
CREATE INDEX "idx_favorites_user_id" ON "accounts"."favorites"("userId");
CREATE INDEX "idx_favorites_product_id" ON "accounts"."favorites"("productId");

ALTER TABLE "accounts"."favorites" ADD CONSTRAINT "favorites_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "accounts"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts"."favorites" ADD CONSTRAINT "favorites_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "catalog"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
