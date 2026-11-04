const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

// Retain the existing command name so deployed Render settings remain valid.
const recoveries = [
  {
    name: '20260801190000_customer_clustering_consistency',
    markers: ['DO $migration$', 'projection_columns'],
    matches: (logs) =>
      logs.includes('42P16') &&
      logs.includes('checkViewColumns') &&
      /["«]last_activity["»]/.test(logs) &&
      /["«]days_since_last_activity["»]/.test(logs),
  },
  {
    name: '20260801210000_monthly_demand_stock_semantics',
    markers: ['DO $migration$', 'has_legacy', 'has_current'],
    matches: (logs) =>
      logs.includes('42703') &&
      logs.includes('renameatt_internal') &&
      /["«]stock_available["»]/.test(logs),
    checkStockView: true,
  },
  {
    name: '20261103193000_account_deletion',
    markers: [
      'CREATE TABLE IF NOT EXISTS',
      'CREATE UNIQUE INDEX IF NOT EXISTS',
      'DO $rental_user_fk$',
      'conkey = ARRAY[rental_user_column]',
      'confkey = ARRAY[account_id_column]',
      'BEGIN;',
      'COMMIT;',
    ],
    matches: (logs) =>
      logs.includes('42704') &&
      logs.includes('ATExecDropConstraint') &&
      /constraint ["«]rental_requests_userId_fkey["»] of relation ["«]rental_requests["»] does not exist/.test(
        logs,
      ),
  },
];
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
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  const pending = [];
  try {
    for (const recovery of recoveries) {
      const failures = await prisma.$queryRawUnsafe(
        `SELECT logs FROM ${quotedSchema}."_prisma_migrations"
         WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL`,
        recovery.name,
      );
      if (!failures.length) continue;
      const fixedSql = fs.readFileSync(
        path.join(
          path.dirname(schema),
          'migrations',
          recovery.name,
          'migration.sql',
        ),
        'utf8',
      );
      if (!recovery.markers.every((marker) => fixedSql.includes(marker))) {
        throw new Error(
          `Publica primero el SQL corregido de ${recovery.name}.`,
        );
      }
      if (failures.some(({ logs }) => !logs || !recovery.matches(logs))) {
        throw new Error(
          `La migración ${recovery.name} tiene un fallo distinto del revisado. No se cambió su estado; revisa los logs de Prisma.`,
        );
      }
      if (recovery.checkStockView) {
        const columns = await prisma.$queryRaw`
          SELECT attname::text AS name FROM pg_attribute
          WHERE attrelid = to_regclass('analytics.v_dataset_monthly_demand')
            AND attnum > 0 AND NOT attisdropped
        `;
        const legacy = columns.some(({ name }) => name === 'stock_available');
        const current = columns.some(
          ({ name }) => name === 'stock_at_month_start',
        );
        if (legacy === current) {
          throw new Error(
            'La vista mensual falta o tiene un contrato de stock ambiguo. No se recuperó la migración.',
          );
        }
      }
      pending.push(recovery.name);
    }
  } finally {
    await prisma.$disconnect();
  }
  if (!pending.length) {
    console.log('No hay un fallo pendiente de migración que recuperar.');
    return;
  }
  // Retry only reviewed failures with corrected, repeatable SQL. Account
  // deletion may have created its table/indexes before failing. Never mark
  // these migrations as applied: migrate deploy must execute the remaining DDL.
  for (const migrationName of pending) {
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
      `Fallo de ${migrationName} marcado para reintento mediante db:migrate:deploy.`,
    );
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
