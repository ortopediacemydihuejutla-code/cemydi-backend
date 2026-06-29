ALTER TABLE management.rental_request_items
  ADD COLUMN IF NOT EXISTS "prescriptionFileName" TEXT,
  ADD COLUMN IF NOT EXISTS "prescriptionMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "prescriptionSizeBytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "prescriptionData" BYTEA;

ALTER TABLE management.rental_requests
  DROP COLUMN IF EXISTS "prescriptionFileName",
  DROP COLUMN IF EXISTS "prescriptionMimeType",
  DROP COLUMN IF EXISTS "prescriptionSizeBytes",
  DROP COLUMN IF EXISTS "prescriptionData";
