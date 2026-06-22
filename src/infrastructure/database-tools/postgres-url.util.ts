export type ParsedPostgresDatabaseUrl = {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
  schema: string;
  sslMode?: string;
  channelBinding?: string;
};

const VALID_SSL_MODES = new Set([
  'disable',
  'allow',
  'prefer',
  'require',
  'verify-ca',
  'verify-full',
]);

const VALID_CHANNEL_BINDING_MODES = new Set(['disable', 'prefer', 'require']);

export function parsePostgresDatabaseUrl(
  rawDatabaseUrl: string,
  options?: {
    defaultSchema?: string;
    onInvalidProtocol?: () => never;
    onInvalidFormat?: () => never;
    onMissingDatabase?: () => never;
    onInvalidSchema?: () => never;
  },
): ParsedPostgresDatabaseUrl {
  let parsed: URL;
  try {
    parsed = new URL(rawDatabaseUrl);
  } catch {
    return options?.onInvalidFormat?.() ?? raise('Invalid PostgreSQL URL');
  }

  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    return (
      options?.onInvalidProtocol?.() ?? raise('Invalid PostgreSQL protocol')
    );
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const schema = (
    parsed.searchParams.get('schema') ??
    options?.defaultSchema ??
    'public'
  ).trim();

  if (!database) {
    return (
      options?.onMissingDatabase?.() ??
      raise('Missing PostgreSQL database name')
    );
  }

  if (!isSafePostgresIdentifier(schema)) {
    return options?.onInvalidSchema?.() ?? raise('Invalid PostgreSQL schema');
  }

  return {
    host: parsed.hostname || 'localhost',
    port: parsed.port || '5432',
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    schema,
    sslMode: normalizePostgresSslMode(parsed.searchParams.get('sslmode')),
    channelBinding: normalizePostgresChannelBinding(
      parsed.searchParams.get('channel_binding'),
    ),
  };
}

export function parseRequiredPostgresDatabaseUrlFromEnv(input: {
  databaseUrl?: string | null;
  directUrl?: string | null;
  defaultSchema?: string;
  onMissingUrl?: () => never;
  onInvalidProtocol?: () => never;
  onInvalidFormat?: () => never;
  onMissingDatabase?: () => never;
  onInvalidSchema?: () => never;
}): ParsedPostgresDatabaseUrl {
  const rawDatabaseUrl = input.directUrl || input.databaseUrl;

  if (!rawDatabaseUrl) {
    return input.onMissingUrl?.() ?? raise('Missing PostgreSQL database URL');
  }

  return parsePostgresDatabaseUrl(rawDatabaseUrl, {
    defaultSchema: input.defaultSchema,
    onInvalidProtocol: input.onInvalidProtocol,
    onInvalidFormat: input.onInvalidFormat,
    onMissingDatabase: input.onMissingDatabase,
    onInvalidSchema: input.onInvalidSchema,
  });
}

export function normalizePostgresSslMode(rawValue: string | null) {
  if (!rawValue) {
    return undefined;
  }

  const value = rawValue.trim().toLowerCase();
  return VALID_SSL_MODES.has(value) ? value : undefined;
}

export function normalizePostgresChannelBinding(rawValue: string | null) {
  if (!rawValue) {
    return undefined;
  }

  const value = rawValue.trim().toLowerCase();
  return VALID_CHANNEL_BINDING_MODES.has(value) ? value : undefined;
}

export function isSafePostgresIdentifier(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function raise(message: string): never {
  throw new Error(message);
}
