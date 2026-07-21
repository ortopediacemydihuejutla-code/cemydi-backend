CREATE TYPE public."RentalDocumentStatus" AS ENUM (
  'PENDIENTE',
  'EN_REVISION',
  'APROBADO',
  'RECHAZADO'
);

CREATE TYPE public."CloudinaryResourceType" AS ENUM ('IMAGE', 'RAW');
CREATE TYPE public."CloudinaryDeliveryType" AS ENUM ('AUTHENTICATED');

CREATE TABLE management.rental_documents (
  id TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "shoppingCartItemId" INTEGER,
  "rentalRequestItemId" INTEGER,
  "assetId" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "resourceType" public."CloudinaryResourceType" NOT NULL,
  "deliveryType" public."CloudinaryDeliveryType" NOT NULL DEFAULT 'AUTHENTICATED',
  format TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  status public."RentalDocumentStatus" NOT NULL DEFAULT 'PENDIENTE',
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "associatedAt" TIMESTAMP(3),
  "cleanupAfter" TIMESTAMP(3),
  "pendingAssetCleanup" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" INTEGER,
  "rejectionReason" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rental_documents_pkey PRIMARY KEY (id),
  CONSTRAINT rental_documents_single_owner_check CHECK (
    "shoppingCartItemId" IS NULL OR "rentalRequestItemId" IS NULL
  ),
  CONSTRAINT rental_documents_bytes_check CHECK (bytes > 0),
  CONSTRAINT rental_documents_userId_fkey FOREIGN KEY ("userId")
    REFERENCES accounts.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT rental_documents_shoppingCartItemId_fkey FOREIGN KEY ("shoppingCartItemId")
    REFERENCES accounts.shopping_cart_items(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT rental_documents_rentalRequestItemId_fkey FOREIGN KEY ("rentalRequestItemId")
    REFERENCES management.rental_request_items(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT rental_documents_reviewedById_fkey FOREIGN KEY ("reviewedById")
    REFERENCES accounts.users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX rental_documents_shoppingCartItemId_key
  ON management.rental_documents ("shoppingCartItemId");
CREATE UNIQUE INDEX rental_documents_rentalRequestItemId_key
  ON management.rental_documents ("rentalRequestItemId");
CREATE UNIQUE INDEX rental_documents_assetId_key
  ON management.rental_documents ("assetId");
CREATE INDEX rental_documents_userId_uploadedAt_idx
  ON management.rental_documents ("userId", "uploadedAt");
CREATE INDEX rental_documents_cleanupAfter_idx
  ON management.rental_documents ("cleanupAfter");
CREATE INDEX rental_documents_status_idx
  ON management.rental_documents (status);

-- Las columnas prescriptionFileName, prescriptionMimeType,
-- prescriptionSizeBytes y prescriptionData permanecen intactas.
