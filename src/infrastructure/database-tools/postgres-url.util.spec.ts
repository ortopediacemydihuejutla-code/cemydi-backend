import {
  isSafePostgresIdentifier,
  normalizePostgresChannelBinding,
  normalizePostgresSslMode,
  parsePostgresDatabaseUrl,
  parseRequiredPostgresDatabaseUrlFromEnv,
} from './postgres-url.util';

describe('postgres-url.util', () => {
  it('debe parsear correctamente una URL de PostgreSQL', () => {
    const url =
      'postgresql://admin:secret@localhost:5432/cemydi_db?schema=public&sslmode=require';
    const parsed = parsePostgresDatabaseUrl(url);

    expect(parsed.host).toBe('localhost');
    expect(parsed.port).toBe('5432');
    expect(parsed.username).toBe('admin');
    expect(parsed.password).toBe('secret');
    expect(parsed.database).toBe('cemydi_db');
    expect(parsed.schema).toBe('public');
    expect(parsed.sslMode).toBe('require');
  });

  it('debe lanzar error si el protocolo no es postgresql:', () => {
    expect(() =>
      parsePostgresDatabaseUrl('mysql://admin:secret@localhost:3306/db'),
    ).toThrow('Invalid PostgreSQL protocol');
  });

  it('debe lanzar error si falta el nombre de la base de datos', () => {
    expect(() =>
      parsePostgresDatabaseUrl('postgresql://admin:secret@localhost:5432/'),
    ).toThrow('Missing PostgreSQL database name');
  });

  it('debe validar identificadores seguros de PostgreSQL', () => {
    expect(isSafePostgresIdentifier('public')).toBe(true);
    expect(isSafePostgresIdentifier('my_schema_1')).toBe(true);
    expect(isSafePostgresIdentifier('1invalid')).toBe(false);
    expect(isSafePostgresIdentifier('schema;drop table')).toBe(false);
  });

  it('debe normalizar sslMode y channelBinding', () => {
    expect(normalizePostgresSslMode('REQUIRE')).toBe('require');
    expect(normalizePostgresSslMode('invalid-mode')).toBeUndefined();
    expect(normalizePostgresChannelBinding('prefer')).toBe('prefer');
    expect(normalizePostgresChannelBinding(null)).toBeUndefined();
  });

  it('debe priorizar directUrl sobre databaseUrl en parseRequiredPostgresDatabaseUrlFromEnv', () => {
    const parsed = parseRequiredPostgresDatabaseUrlFromEnv({
      directUrl: 'postgresql://direct:pass@db.internal:5432/main',
      databaseUrl: 'postgresql://pooled:pass@db.internal:6543/main',
    });
    expect(parsed.username).toBe('direct');
  });
});
