BEGIN;

-- A failed deploy may already have created this table and its indexes.
CREATE TABLE IF NOT EXISTS "accounts"."account_deletion_requests" (
 "id" TEXT NOT NULL, "userId" INTEGER, "subjectId" INTEGER NOT NULL,
 "subjectCreatedAt" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
 "codeHash" TEXT, "codeExpiresAt" TIMESTAMP(3), "attemptCount" INTEGER NOT NULL DEFAULT 0,
 "resendAt" TIMESTAMP(3), "confirmedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseUntil" TIMESTAMP(3), "errorCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "account_deletion_requests_status_check" CHECK ("status" IN ('AWAITING_CONFIRMATION','WAITING_OBLIGATIONS','PROCESSING','COMPLETED')),
 CONSTRAINT "account_deletion_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "accounts"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "account_deletion_requests_userId_key" ON "accounts"."account_deletion_requests"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "account_deletion_requests_subjectId_key" ON "accounts"."account_deletion_requests"("subjectId");
CREATE INDEX IF NOT EXISTS "account_deletion_requests_status_nextAttemptAt_idx" ON "accounts"."account_deletion_requests"("status", "nextAttemptAt");

-- Historical SQL used an unquoted name (userid); Prisma-generated schemas use
-- the quoted userId name. Match the actual relation and columns, not its name.
DO $rental_user_fk$
DECLARE
 rental_user_column smallint;
 account_id_column smallint;
 existing_fk record;
BEGIN
 SELECT attnum INTO STRICT rental_user_column FROM pg_attribute
 WHERE attrelid = 'management.rental_requests'::regclass
   AND attname = 'userId' AND NOT attisdropped;
 SELECT attnum INTO STRICT account_id_column FROM pg_attribute
 WHERE attrelid = 'accounts.users'::regclass
   AND attname = 'id' AND NOT attisdropped;

 FOR existing_fk IN SELECT conname FROM pg_constraint
 WHERE conrelid = 'management.rental_requests'::regclass
   AND confrelid = 'accounts.users'::regclass AND contype = 'f'
   AND conkey = ARRAY[rental_user_column]
   AND confkey = ARRAY[account_id_column]
 LOOP
  EXECUTE format('ALTER TABLE management.rental_requests DROP CONSTRAINT %I', existing_fk.conname);
 END LOOP;
END $rental_user_fk$;
ALTER TABLE "management"."rental_requests" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "management"."rental_requests" ADD CONSTRAINT "rental_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "accounts"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Give existing scoped backend readers only the columns needed to block rental mutations.
DO $grants$
DECLARE reader record;
BEGIN
 FOR reader IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
  WHERE table_schema = 'accounts' AND table_name = 'users'
    AND privilege_type = 'SELECT' AND grantee <> 'PUBLIC'
 LOOP
  EXECUTE format('GRANT SELECT ("id", "subjectId", "confirmedAt") ON "accounts"."account_deletion_requests" TO %I', reader.grantee);
 END LOOP;
END $grants$;

COMMIT;
