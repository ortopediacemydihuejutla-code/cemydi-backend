ALTER TABLE "management"."rental_request_items"
  ADD COLUMN "productBrandSnapshot" TEXT,
  ADD COLUMN "productSkuSnapshot" TEXT,
  ADD COLUMN "productImageSnapshot" TEXT,
  ADD COLUMN "productClassSnapshot" TEXT,
  ADD COLUMN "prescriptionRequiredSnapshot" BOOLEAN;
