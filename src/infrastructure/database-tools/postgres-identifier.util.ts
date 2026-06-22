import { isSafePostgresIdentifier } from './postgres-url.util';

export function assertSafePostgresIdentifier(value: string) {
  return isSafePostgresIdentifier(value);
}

export function parseQualifiedPostgresName(
  value: string,
  allowedSchemas: readonly string[],
) {
  const [schema, name] = value.split('.');

  if (!schema || !name) {
    return null;
  }

  if (!allowedSchemas.includes(schema) || !assertSafePostgresIdentifier(name)) {
    return null;
  }

  return { schema, name };
}
