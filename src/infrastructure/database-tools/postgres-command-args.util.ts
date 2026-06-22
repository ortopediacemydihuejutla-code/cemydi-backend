export interface BuildPostgresConnectionArgsInput {
  host: string;
  port: string | number;
  username?: string;
  database?: string;
  databaseBeforeUsername?: boolean;
  includeNoPassword?: boolean;
}

export function buildPostgresConnectionArgs(
  input: BuildPostgresConnectionArgsInput,
): string[] {
  const args = ['--host', input.host, '--port', String(input.port)];

  const usernameArgs =
    input.username && input.username.length > 0
      ? ['--username', input.username]
      : [];
  const databaseArgs =
    input.database && input.database.length > 0
      ? ['--dbname', input.database]
      : [];

  if (input.databaseBeforeUsername) {
    args.push(...databaseArgs, ...usernameArgs);
  } else {
    args.push(...usernameArgs, ...databaseArgs);
  }

  if (input.includeNoPassword) {
    args.push('--no-password');
  }

  return args;
}
