CREATE SCHEMA accounts;
CREATE SCHEMA management;
CREATE SCHEMA analytics;

CREATE TABLE accounts.users (id integer PRIMARY KEY, nombre text, correo text);
CREATE TABLE analytics.customer_product_interactions (
  "userId" integer, "productId" integer, "interactionType" text,
  "occurredAt" timestamp, "batchName" text
);
CREATE TABLE management.sales_orders (
  id integer PRIMARY KEY, "userId" integer, status text, total numeric,
  "orderDate" timestamp, "batchName" text
);
CREATE TABLE management.sales_order_items (
  "salesOrderId" integer, quantity integer
);
CREATE TABLE management.rental_requests (
  id text PRIMARY KEY, "userId" integer, status text, subtotal double precision,
  "approvedAt" timestamp, "statusUpdatedAt" timestamp, "createdAt" timestamp,
  "deliveredAt" timestamp, "returnedAt" timestamp
);
CREATE TABLE management.rental_request_items (
  "rentalRequestId" text, quantity integer, days integer
);

INSERT INTO accounts.users VALUES (1, 'Migration sentinel', 'demo.usuario1@cemydi.local');
INSERT INTO analytics.customer_product_interactions VALUES
  (1, 1, 'VIEW', CURRENT_TIMESTAMP - INTERVAL '10 days', 'CEMYDI_DEMO_2024_2026_V1'),
  (1, 2, 'VIEW', CURRENT_TIMESTAMP - INTERVAL '5 days', 'CEMYDI_DEMO_2024_2026_V1');
INSERT INTO management.sales_orders VALUES
  (1, 1, 'COMPLETED', 100, CURRENT_TIMESTAMP - INTERVAL '5 days', 'CEMYDI_DEMO_2024_2026_V1');
INSERT INTO management.sales_order_items VALUES (1, 1), (1, 2);
