ALTER TABLE management.rental_requests
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "returnedAt" TIMESTAMP(3),
  ADD COLUMN "statusUpdatedById" INTEGER;

ALTER TABLE management.rental_requests
  ADD CONSTRAINT rental_requests_statusUpdatedById_fkey
  FOREIGN KEY ("statusUpdatedById") REFERENCES accounts.users(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX rental_requests_statusUpdatedById_idx
  ON management.rental_requests ("statusUpdatedById");
