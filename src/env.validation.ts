type EnvRecord = Record<string, unknown>;

export function validateEnv(config: EnvRecord) {
  const normalized = { ...config };
  const isProduction = normalized.NODE_ENV === 'production';

  normalized.JWT_SECRET = requireNonEmptyString(
    normalized.JWT_SECRET,
    'JWT_SECRET es obligatorio. Defínelo en las variables de entorno.',
  );
  validateJwtSecretStrength(normalized.JWT_SECRET as string);

  normalized.DATABASE_URL = validatePostgresDatabaseUrl(
    requireNonEmptyString(
      normalized.DATABASE_URL,
      'DATABASE_URL es obligatorio. Defínelo en las variables de entorno.',
    ),
    'DATABASE_URL',
  );

  if (
    typeof normalized.DATABASE_DIRECT_URL === 'string' &&
    normalized.DATABASE_DIRECT_URL.trim()
  ) {
    normalized.DATABASE_DIRECT_URL = validatePostgresDatabaseUrl(
      normalized.DATABASE_DIRECT_URL.trim(),
      'DATABASE_DIRECT_URL',
    );
  }

  validateOptionalScopedDatabaseUrl(normalized, 'DATABASE_URL_CLIENT');
  validateOptionalScopedDatabaseUrl(normalized, 'DATABASE_URL_READER');

  if (isProduction) {
    normalized.CORS_ORIGIN = requireNonEmptyString(
      normalized.CORS_ORIGIN,
      'CORS_ORIGIN es obligatorio en production.',
    );
    validateHttpUrlList(normalized.CORS_ORIGIN as string, 'CORS_ORIGIN');
    normalized.BACKEND_PUBLIC_URL = requireNonEmptyString(
      normalized.BACKEND_PUBLIC_URL,
      'BACKEND_PUBLIC_URL es obligatorio en production.',
    );
    validateHttpUrl(
      normalized.BACKEND_PUBLIC_URL as string,
      'BACKEND_PUBLIC_URL',
    );
    normalized.CLOUDINARY_URL = requireNonEmptyString(
      normalized.CLOUDINARY_URL,
      'CLOUDINARY_URL es obligatorio en production.',
    );
    normalized.BREVO_API_KEY = requireNonEmptyString(
      normalized.BREVO_API_KEY,
      'BREVO_API_KEY es obligatorio en production.',
    );
    normalized.EMAIL_FROM = requireNonEmptyString(
      normalized.EMAIL_FROM,
      'EMAIL_FROM es obligatorio en production.',
    );
    validateEmailAddress(normalized.EMAIL_FROM as string, 'EMAIL_FROM');
    normalized.FRONTEND_URL = requireNonEmptyString(
      normalized.FRONTEND_URL,
      'FRONTEND_URL es obligatorio en production.',
    );
    validateHttpUrl(normalized.FRONTEND_URL as string, 'FRONTEND_URL');
    normalized.GOOGLE_SIGNIN_CLIENT_ID = requireNonEmptyString(
      normalized.GOOGLE_SIGNIN_CLIENT_ID,
      'GOOGLE_SIGNIN_CLIENT_ID es obligatorio en production.',
    );
    normalized.GOOGLE_SIGNIN_CLIENT_SECRET = requireNonEmptyString(
      normalized.GOOGLE_SIGNIN_CLIENT_SECRET,
      'GOOGLE_SIGNIN_CLIENT_SECRET es obligatorio en production.',
    );
  }

  normalizeOptionalPositiveInteger(normalized, 'PORT');
  normalizeOptionalPositiveInteger(
    normalized,
    'EMAIL_VERIFICATION_TOKEN_EXPIRATION_MINUTES',
  );
  normalizeOptionalPositiveInteger(
    normalized,
    'PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES',
  );
  // Alias heredados: se conservan durante la transición de despliegues existentes.
  normalizeOptionalPositiveInteger(
    normalized,
    'EMAIL_VERIFICATION_EXPIRES_MINUTES',
  );
  normalizeOptionalPositiveInteger(
    normalized,
    'PASSWORD_RESET_EXPIRES_MINUTES',
  );
  normalizeOptionalPositiveInteger(normalized, 'PASSWORD_RESET_MAX_ATTEMPTS');
  normalizeOptionalPositiveInteger(normalized, 'JWT_REFRESH_EXPIRES_DAYS');
  normalizeOptionalPositiveInteger(normalized, 'LOGIN_MAX_FAILED_ATTEMPTS');
  normalizeOptionalPositiveInteger(normalized, 'LOGIN_LOCKOUT_MINUTES');
  normalizeOptionalPositiveInteger(
    normalized,
    'RENTAL_TEMP_DOCUMENT_TTL_HOURS',
  );
  normalizeOptionalBoolean(normalized, 'AUTH_COOKIE_SECURE');
  normalizeOptionalBoolean(normalized, 'SWAGGER_ENABLED');

  const authCookieSecure = normalized.AUTH_COOKIE_SECURE;
  if (
    isProduction &&
    typeof authCookieSecure === 'string' &&
    ['false', '0', 'no'].includes(authCookieSecure)
  ) {
    throw new Error('AUTH_COOKIE_SECURE no puede desactivarse en production.');
  }

  return normalized;
}

function validateHttpUrl(value: string, key: string) {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error();
    }
  } catch {
    throw new Error(`${key} debe ser una URL valida http:// o https://.`);
  }
}

function validateHttpUrlList(value: string, key: string) {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error(`${key} debe incluir al menos una URL valida.`);
  }

  for (const origin of origins) {
    validateHttpUrl(origin, key);
  }
}

function validateEmailAddress(value: string, key: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new Error(`${key} debe ser un correo electrónico válido.`);
  }
}

function validatePostgresDatabaseUrl(value: string, key: string) {
  const trimmed = value.trim();

  if (
    trimmed.startsWith('prisma://') ||
    trimmed.startsWith('prisma+postgres://')
  ) {
    throw new Error(
      `${key} usa Prisma Accelerate/Data Proxy (prisma://). Este proyecto opera con PostgreSQL directo. Usa postgresql:// en desarrollo o regenera el cliente solo si Accelerate es intencional.`,
    );
  }

  if (
    !trimmed.startsWith('postgresql://') &&
    !trimmed.startsWith('postgres://')
  ) {
    throw new Error(
      `${key} debe ser una URL PostgreSQL valida (postgresql://...).`,
    );
  }

  return trimmed;
}

function validateOptionalScopedDatabaseUrl(config: EnvRecord, key: string) {
  const rawValue = config[key];

  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return;
  }

  config[key] = validatePostgresDatabaseUrl(rawValue, key);
}

function requireNonEmptyString(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function validateJwtSecretStrength(value: string) {
  if (value.length < 32) {
    throw new Error(
      'JWT_SECRET debe tener al menos 32 caracteres y ser aleatorio.',
    );
  }
}

function normalizeOptionalPositiveInteger(config: EnvRecord, key: string) {
  const rawValue = config[key];

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${key} debe ser un entero positivo.`);
  }

  config[key] = String(parsed);
}

function normalizeOptionalBoolean(config: EnvRecord, key: string) {
  const rawValue = config[key];

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return;
  }

  if (
    typeof rawValue !== 'string' &&
    typeof rawValue !== 'number' &&
    typeof rawValue !== 'boolean'
  ) {
    throw new Error(`${key} debe ser un booleano valido.`);
  }

  const normalized = `${rawValue}`.trim().toLowerCase();
  if (!['true', 'false', '1', '0', 'yes', 'no', 'si'].includes(normalized)) {
    throw new Error(`${key} debe ser un booleano valido.`);
  }

  config[key] = normalized;
}
