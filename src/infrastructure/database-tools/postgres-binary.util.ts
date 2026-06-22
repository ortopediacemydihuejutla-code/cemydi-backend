export type PostgresBinaryName =
  | 'pg_dump'
  | 'pg_restore'
  | 'psql'
  | 'vacuumdb'
  | 'reindexdb';

export function resolvePostgresBinary(
  binaryName: PostgresBinaryName,
  configuredPath?: string | null,
): string {
  const normalizedPath = configuredPath?.trim();

  if (normalizedPath) {
    return normalizedPath;
  }

  return process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
}
