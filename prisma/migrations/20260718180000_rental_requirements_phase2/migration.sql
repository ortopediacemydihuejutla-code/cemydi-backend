CREATE TYPE public."RentalDeliveryMethod" AS ENUM ('PICKUP', 'HOME_DELIVERY');

CREATE SEQUENCE management.rental_folio_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

ALTER TABLE management.rental_requests
  ADD COLUMN folio TEXT,
  ADD COLUMN "applicantName" TEXT,
  ADD COLUMN "applicantEmail" TEXT,
  ADD COLUMN "applicantPhone" TEXT,
  ADD COLUMN "isForAnotherPerson" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "patientName" TEXT,
  ADD COLUMN "patientRelationship" TEXT,
  ADD COLUMN "deliveryMethod" public."RentalDeliveryMethod",
  ADD COLUMN "deliveryAddress" TEXT,
  ADD COLUMN "deliveryNeighborhood" TEXT,
  ADD COLUMN "deliveryPostalCode" TEXT,
  ADD COLUMN "deliveryMunicipality" TEXT,
  ADD COLUMN "deliveryReferences" TEXT,
  ADD COLUMN "preferredSchedule" TEXT,
  ADD COLUMN "rentalTermsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX rental_requests_folio_key
  ON management.rental_requests (folio);

ALTER TABLE management.rental_request_items
  ADD COLUMN "productNameSnapshot" TEXT,
  ADD COLUMN "productModelSnapshot" TEXT,
  DROP COLUMN "prescriptionFileName",
  DROP COLUMN "prescriptionMimeType",
  DROP COLUMN "prescriptionSizeBytes",
  DROP COLUMN "prescriptionData";

COMMENT ON COLUMN management.rental_requests.folio IS
  'Folio generado en backend con secuencia PostgreSQL: REN-AAAA-000001.';
