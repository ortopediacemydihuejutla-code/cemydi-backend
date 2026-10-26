const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const migrationName = '20260801190000_customer_clustering_consistency';
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--schema')) {
  console.error(
    'Uso: node scripts/recover-clustering-migration.cjs [--schema ruta]',
  );
  process.exit(1);
}
const schema = path.resolve(
  args[1] || path.join(__dirname, '../prisma/schema.prisma'),
);

async function main() {
  // Require explicit environment variables; do not silently target a local .env.
  const databaseUrl =
    process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error(
      'Configura DATABASE_DIRECT_URL en el entorno de Render antes de recuperar la migración.',
    );
  const parsed = new URL(databaseUrl);
  const historySchema = parsed.searchParams.get('schema') || 'public';
  const quotedSchema = `"${historySchema.replaceAll('"', '""')}"`;
  const fixedSql = fs.readFileSync(
    path.join(
      path.dirname(schema),
      'migrations',
      migrationName,
      'migration.sql',
    ),
    'utf8',
  );
  if (
    !fixedSql.includes('DO $migration$') ||
    !fixedSql.includes('projection_columns')
  ) {
    throw new Error(
      'Publica primero la migración corregida que conserva el orden de columnas.',
    );
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  let failures;
  try {
    failures = await prisma.$queryRawUnsafe(
      `SELECT logs FROM ${quotedSchema}."_prisma_migrations"
       WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL`,
      migrationName,
    );
  } finally {
    await prisma.$disconnect();
  }

  if (!failures.length) {
    console.log('No hay un fallo pendiente de clustering que recuperar.');
    return;
  }
  // The original migration is one CREATE OR REPLACE VIEW statement: 42P16
  // aborts it atomically, so there are no partially applied steps to undo.
  if (
    failures.some(
      ({ logs }) =>
        !logs ||
        !logs.includes('42P16') ||
        !logs.includes('checkViewColumns') ||
        !/["«]last_activity["»]/.test(logs) ||
        !/["«]days_since_last_activity["»]/.test(logs),
    )
  ) {
    throw new Error(
      'La migración tiene un fallo distinto del revisado. No se cambió su estado; revisa los logs de Prisma.',
    );
  }

  const result = spawnSync(
    process.execPath,
    [
      require.resolve('prisma/build/index.js'),
      'migrate',
      'resolve',
      '--rolled-back',
      migrationName,
      '--schema',
      schema,
    ],
    {
      stdio: 'inherit',
      timeout: 120_000,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DATABASE_DIRECT_URL: databaseUrl,
      },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      'Prisma no pudo recuperar la migración. El backend no debe iniciar.',
    );
  console.log(
    'Fallo de clustering marcado para reintento. Ejecuta db:migrate:deploy para aplicar el SQL corregido.',
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
