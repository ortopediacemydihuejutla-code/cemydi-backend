CREATE TABLE "accounts"."account_deletion_requests" (
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
CREATE UNIQUE INDEX "account_deletion_requests_userId_key" ON "accounts"."account_deletion_requests"("userId");
CREATE UNIQUE INDEX "account_deletion_requests_subjectId_key" ON "accounts"."account_deletion_requests"("subjectId");
CREATE INDEX "account_deletion_requests_status_nextAttemptAt_idx" ON "accounts"."account_deletion_requests"("status", "nextAttemptAt");
ALTER TABLE "management"."rental_requests" DROP CONSTRAINT "rental_requests_userId_fkey";
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
