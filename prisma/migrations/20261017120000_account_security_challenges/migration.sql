ALTER TYPE "public"."AuthTokenPurpose" ADD VALUE IF NOT EXISTS 'EMAIL_CHANGE_CODE';
ALTER TYPE "public"."AuthTokenPurpose" ADD VALUE IF NOT EXISTS 'PASSWORD_CHANGE_CODE';

CREATE TABLE "accounts"."security_notices" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "actorId" INTEGER,
  "correo" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "security_notices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_notices_deliveredAt_nextAttemptAt_leaseUntil_idx"
  ON "accounts"."security_notices"("deliveredAt", "nextAttemptAt", "leaseUntil");
