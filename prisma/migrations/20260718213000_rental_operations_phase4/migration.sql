CREATE TYPE public."RentalDepositStatus" AS ENUM (
  'PENDING',
  'RETURNED',
  'RETAINED',
  'PARTIALLY_RETAINED'
);

ALTER TABLE management.rental_requests
  ADD COLUMN "depositStatus" public."RentalDepositStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "depositReturnedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "depositRetainedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "depositNotes" TEXT,
  ADD COLUMN "depositResolvedAt" TIMESTAMP(3),
  ADD COLUMN "depositResolvedById" INTEGER;

ALTER TABLE management.rental_requests
  ADD CONSTRAINT rental_requests_depositResolvedById_fkey
  FOREIGN KEY ("depositResolvedById") REFERENCES accounts.users(id)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT rental_requests_deposit_amounts_check
  CHECK ("depositReturnedAmount" >= 0 AND "depositRetainedAmount" >= 0);

CREATE TABLE management.rental_status_history (
  id SERIAL NOT NULL,
  "rentalRequestId" TEXT NOT NULL,
  "fromStatus" public."RentalRequestStatus",
  "toStatus" public."RentalRequestStatus" NOT NULL,
  note TEXT,
  "actorId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rental_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT rental_status_history_rentalRequestId_fkey
    FOREIGN KEY ("rentalRequestId") REFERENCES management.rental_requests(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT rental_status_history_actorId_fkey
    FOREIGN KEY ("actorId") REFERENCES accounts.users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX rental_status_history_rentalRequestId_createdAt_idx
  ON management.rental_status_history ("rentalRequestId", "createdAt");
CREATE INDEX rental_status_history_actorId_idx
  ON management.rental_status_history ("actorId");

COMMENT ON TABLE management.rental_status_history IS
  'Registra transiciones nuevas desde Fase 4; no inventa historial previo.';
