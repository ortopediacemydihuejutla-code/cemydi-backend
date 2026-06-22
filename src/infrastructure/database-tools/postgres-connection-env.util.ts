import { ParsedPostgresDatabaseUrl } from './postgres-url.util';

export function buildPostgresConnectionEnv(
  config: Pick<
    ParsedPostgresDatabaseUrl,
    'password' | 'sslMode' | 'channelBinding'
  >,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    ...(config.password ? { PGPASSWORD: config.password } : {}),
    ...(config.sslMode ? { PGSSLMODE: config.sslMode } : {}),
    ...(config.channelBinding
      ? { PGCHANNELBINDING: config.channelBinding }
      : {}),
  };
}
