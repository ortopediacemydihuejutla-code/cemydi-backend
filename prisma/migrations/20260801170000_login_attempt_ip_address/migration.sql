-- AlterTable
ALTER TABLE "accounts"."login_attempts" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "login_attempts_ipAddress_attemptedAt_idx" ON "accounts"."login_attempts"("ipAddress", "attemptedAt");
