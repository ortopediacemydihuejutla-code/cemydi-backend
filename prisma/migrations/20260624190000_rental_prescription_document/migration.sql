ALTER TABLE management.rental_requests
  ADD COLUMN "prescriptionFileName" TEXT,
  ADD COLUMN "prescriptionMimeType" TEXT,
  ADD COLUMN "prescriptionSizeBytes" INTEGER,
  ADD COLUMN "prescriptionData" BYTEA;
