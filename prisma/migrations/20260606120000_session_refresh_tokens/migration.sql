ALTER TABLE "accounts"."user_sessions"
ADD COLUMN "refreshTokenHash" TEXT;

CREATE UNIQUE INDEX "user_sessions_refreshTokenHash_key"
ON "accounts"."user_sessions"("refreshTokenHash");
