-- Existing promotions receive a conservative 10% discount so every published
-- offer has a real, auditable price benefit after this migration.
ALTER TABLE "management"."promotions"
ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "management"."promotions"
ADD CONSTRAINT "promotions_discountPercent_check"
CHECK ("discountPercent" BETWEEN 1 AND 90);
