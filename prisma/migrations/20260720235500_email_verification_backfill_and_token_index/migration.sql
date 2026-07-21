-- Las cuentas creadas antes de incorporar la verificación por correo se
-- consideran verificadas para no bloquear usuarios existentes.
UPDATE "accounts"."users"
SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL
  AND "createdAt" < TIMESTAMP WITH TIME ZONE '2026-03-22 12:00:00+00';

-- Acelera la confirmación y evita que dos registros compartan el mismo hash.
CREATE UNIQUE INDEX IF NOT EXISTS "auth_tokens_tokenHash_key"
ON "accounts"."auth_tokens"("tokenHash");
