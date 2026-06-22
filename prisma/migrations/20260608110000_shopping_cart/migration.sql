CREATE TABLE "accounts"."shopping_carts" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounts"."shopping_cart_items" (
    "id" SERIAL NOT NULL,
    "cartId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_cart_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shopping_carts_userId_key" ON "accounts"."shopping_carts"("userId");
CREATE UNIQUE INDEX "shopping_cart_items_cartId_productId_key" ON "accounts"."shopping_cart_items"("cartId", "productId");
CREATE INDEX "shopping_cart_items_productId_idx" ON "accounts"."shopping_cart_items"("productId");

ALTER TABLE "accounts"."shopping_carts"
ADD CONSTRAINT "shopping_carts_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "accounts"."users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounts"."shopping_cart_items"
ADD CONSTRAINT "shopping_cart_items_cartId_fkey"
FOREIGN KEY ("cartId") REFERENCES "accounts"."shopping_carts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounts"."shopping_cart_items"
ADD CONSTRAINT "shopping_cart_items_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "catalog"."products"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
