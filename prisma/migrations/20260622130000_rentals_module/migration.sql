CREATE TYPE public."CartItemMode" AS ENUM ('VENTA', 'RENTA');
CREATE TYPE public."RentalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'DELIVERED', 'RETURNED');

ALTER TABLE catalog.products
  ADD COLUMN "rentalDailyPrice" DOUBLE PRECISION,
  ADD COLUMN "rentalMinDays" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "rentalDeposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "rentalTerms" TEXT;

ALTER TABLE accounts.shopping_cart_items
  ADD COLUMN "mode" public."CartItemMode" NOT NULL DEFAULT 'VENTA',
  ADD COLUMN "rentalStartDate" TIMESTAMP(3),
  ADD COLUMN "rentalEndDate" TIMESTAMP(3),
  ADD COLUMN "rentalNotes" TEXT;

ALTER TABLE accounts.shopping_cart_items
  DROP CONSTRAINT IF EXISTS shopping_cart_items_cartId_productId_key;

CREATE UNIQUE INDEX shopping_cart_items_sale_unique_idx
  ON accounts.shopping_cart_items ("cartId", "productId")
  WHERE "mode" = 'VENTA';

CREATE UNIQUE INDEX shopping_cart_items_rental_unique_idx
  ON accounts.shopping_cart_items ("cartId", "productId", "rentalStartDate", "rentalEndDate")
  WHERE "mode" = 'RENTA';

CREATE TABLE management.rental_requests (
  id TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  status public."RentalRequestStatus" NOT NULL DEFAULT 'PENDING',
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  "depositTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT,
  "rejectedReason" TEXT,
  "approvedById" INTEGER,
  "approvedAt" TIMESTAMP(3),
  "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rental_requests_pkey PRIMARY KEY (id),
  CONSTRAINT rental_requests_userId_fkey FOREIGN KEY ("userId") REFERENCES accounts.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT rental_requests_approvedById_fkey FOREIGN KEY ("approvedById") REFERENCES accounts.users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE management.rental_request_items (
  id SERIAL NOT NULL,
  "rentalRequestId" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  days INTEGER NOT NULL,
  "dailyPrice" DOUBLE PRECISION NOT NULL,
  deposit DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lineSubtotal" DOUBLE PRECISION NOT NULL,
  "lineDeposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lineTotal" DOUBLE PRECISION NOT NULL,
  notes TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rental_request_items_pkey PRIMARY KEY (id),
  CONSTRAINT rental_request_items_rentalRequestId_fkey FOREIGN KEY ("rentalRequestId") REFERENCES management.rental_requests(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT rental_request_items_productId_fkey FOREIGN KEY ("productId") REFERENCES catalog.products(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX rental_requests_userId_createdAt_idx ON management.rental_requests ("userId", "createdAt");
CREATE INDEX rental_requests_status_createdAt_idx ON management.rental_requests (status, "createdAt");
CREATE INDEX rental_request_items_rentalRequestId_idx ON management.rental_request_items ("rentalRequestId");
CREATE INDEX rental_request_items_productId_idx ON management.rental_request_items ("productId");
CREATE INDEX rental_request_items_startDate_endDate_idx ON management.rental_request_items ("startDate", "endDate");
