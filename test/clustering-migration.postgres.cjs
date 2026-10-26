const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

// This regression test must never use the application's DATABASE_URL or .env.
const url = new URL(process.env.CLUSTERING_TEST_DATABASE_URL || 'invalid:');
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.username, 'test_security');
assert.match(url.pathname, /^\/migration_recovery_test(?:_[a-z0-9]+)?$/);
assert.ok(url.port, 'An explicit isolated PostgreSQL port is required');
const psql = process.env.CLUSTERING_TEST_PSQL;
assert.ok(psql, 'Set CLUSTERING_TEST_PSQL to the local psql executable');

const root = path.resolve(__dirname, '..');
const migrationName = '20260801190000_customer_clustering_consistency';
const fixedSql = fs.readFileSync(
  path.join(root, 'prisma/migrations', migrationName, 'migration.sql'),
  'utf8',
);
const query = /\$query\$([\s\S]*?)\$query\$/.exec(fixedSql)?.[1];
assert.ok(
  query,
  'The corrected query must be available for regression coverage',
);
const columns = [
  'customer_id',
  'customer_name',
  'email',
  'views',
  'searches',
  'add_to_cart',
  'favorites',
  'shares',
  'distinct_products_interacted',
  'total_interactions',
  'completed_sales',
  'units_purchased',
  'amount_spent_sales',
  'valid_rentals',
  'units_rented',
  'amount_spent_rentals',
  'average_rental_days',
  'last_activity',
  'days_since_last_activity',
  'average_monthly_activity',
];
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const sqlArgs = [
  '-X',
  '-h',
  url.hostname,
  '-p',
  url.port,
  '-U',
  url.username,
  '-d',
  url.pathname.slice(1),
  '-v',
  'ON_ERROR_STOP=1',
];
const env = {
  ...process.env,
  CLUSTERING_TEST_DATABASE_URL: url.toString(),
  PGPASSWORD: decodeURIComponent(url.password),
};
const testDirectory = fs.mkdtempSync(
  path.join(root, '.temp/migration-recovery-'),
);

function runSql(sql) {
  const result = spawnSync(psql, sqlArgs, {
    input: sql,
    encoding: 'utf8',
    env,
  });
  assert.equal(result.status, 0, result.stderr);
}

function prisma(args, expectedStatus = 0) {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('prisma/build/index.js'),
      ...args,
      '--schema',
      path.join(testDirectory, 'schema.prisma'),
    ],
    { encoding: 'utf8', env },
  );
  assert.equal(
    result.status,
    expectedStatus,
    `${result.stdout}\n${result.stderr}`,
  );
  return `${result.stdout}\n${result.stderr}`;
}

async function contract() {
  return db.$queryRaw`
    SELECT c.oid::text AS oid, c.relacl::text AS grants,
           array_agg(a.attname::text ORDER BY a.attnum) AS columns
    FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE c.oid = 'analytics.v_dataset_customer_clustering'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
    GROUP BY c.oid, c.relacl::text
  `;
}

async function main() {
  const tables =
    await db.$queryRaw`SELECT count(*)::integer AS count FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`;
  assert.equal(
    tables[0].count,
    0,
    'Use a fresh isolated test database; this test never deletes an existing schema',
  );
  runSql(
    fs.readFileSync(
      path.join(__dirname, 'fixtures/clustering-migration.sql'),
      'utf8',
    ),
  );
  runSql(
    `CREATE VIEW analytics.v_dataset_customer_clustering AS SELECT ${columns.join(', ')} FROM (${query}) AS original_dataset`,
  );
  runSql(
    'GRANT SELECT ON analytics.v_dataset_customer_clustering TO PUBLIC; CREATE VIEW analytics.clustering_dependent AS SELECT customer_id, last_activity FROM analytics.v_dataset_customer_clustering;',
  );
  const before = await contract();
  const beforeRows =
    await db.$queryRaw`SELECT * FROM analytics.v_dataset_customer_clustering`;

  fs.writeFileSync(
    path.join(testDirectory, 'schema.prisma'),
    `generator client {
    provider = "prisma-client-js"
  }
  datasource db {
    provider = "postgresql"
    url = env("CLUSTERING_TEST_DATABASE_URL")
  }`,
  );
  const migrations = path.join(testDirectory, 'migrations');
  fs.mkdirSync(path.join(migrations, '0_fixture_baseline'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(migrations, '0_fixture_baseline/migration.sql'),
    'SELECT 1;',
  );
  fs.writeFileSync(
    path.join(migrations, 'migration_lock.toml'),
    'provider = "postgresql"\n',
  );
  fs.mkdirSync(path.join(migrations, migrationName));
  const testMigration = path.join(migrations, migrationName, 'migration.sql');
  fs.writeFileSync(
    testMigration,
    `CREATE OR REPLACE VIEW analytics.v_dataset_customer_clustering AS ${query};`,
  );
  prisma(['migrate', 'resolve', '--applied', '0_fixture_baseline']);
  const failed = prisma(['migrate', 'deploy'], 1);
  assert.match(failed, /P3018/);
  assert.match(failed, /42P16/);
  assert.deepEqual(await contract(), before);

  fs.writeFileSync(testMigration, fixedSql);
  const recoveryEnv = {
    ...env,
    DATABASE_URL: url.toString(),
    DATABASE_DIRECT_URL: url.toString(),
  };
  function recover(expectedStatus = 0) {
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, 'scripts/recover-clustering-migration.cjs'),
        '--schema',
        path.join(testDirectory, 'schema.prisma'),
      ],
      { encoding: 'utf8', env: recoveryEnv },
    );
    assert.equal(
      result.status,
      expectedStatus,
      `${result.stdout}\n${result.stderr}`,
    );
    return `${result.stdout}\n${result.stderr}`;
  }
  const originalFailure =
    await db.$queryRaw`SELECT id, logs FROM public._prisma_migrations WHERE migration_name = ${migrationName} AND finished_at IS NULL AND rolled_back_at IS NULL`;
  await db.$executeRaw`UPDATE public._prisma_migrations SET logs = 'Unrelated database error' WHERE id = ${originalFailure[0].id}`;
  assert.match(recover(1), /fallo distinto/);
  assert.equal(
    (
      await db.$queryRaw`SELECT rolled_back_at FROM public._prisma_migrations WHERE id = ${originalFailure[0].id}`
    )[0].rolled_back_at,
    null,
  );
  await db.$executeRaw`UPDATE public._prisma_migrations SET logs = ${originalFailure[0].logs} WHERE id = ${originalFailure[0].id}`;
  recover();
  prisma(['migrate', 'deploy']);
  assert.match(recover(), /No hay un fallo pendiente/);
  assert.deepEqual(
    await contract(),
    before,
    'Column order, object identity and grants must be preserved',
  );
  assert.deepEqual(
    await db.$queryRaw`SELECT * FROM analytics.v_dataset_customer_clustering`,
    beforeRows,
  );
  assert.equal(
    (await db.$queryRaw`SELECT * FROM analytics.clustering_dependent`).length,
    1,
  );
  assert.equal(
    (await db.$queryRaw`SELECT nombre FROM accounts.users WHERE id = 1`)[0]
      .nombre,
    'Migration sentinel',
  );
  const states =
    await db.$queryRaw`SELECT finished_at, rolled_back_at FROM public._prisma_migrations WHERE migration_name = ${migrationName}`;
  assert.equal(states.filter((state) => state.finished_at !== null).length, 1);
  assert.equal(
    states.filter((state) => state.rolled_back_at !== null).length,
    1,
  );
  runSql(fixedSql);
  assert.deepEqual(await contract(), before);

  // Environments where the previous query already succeeded have a different order.
  runSql(
    'ALTER VIEW analytics.v_dataset_customer_clustering RENAME TO clustering_legacy_checked;',
  );
  runSql(`CREATE VIEW analytics.v_dataset_customer_clustering AS ${query}`);
  const alreadyApplied = await contract();
  runSql(fixedSql);
  assert.deepEqual(await contract(), alreadyApplied);
  runSql(
    'ALTER VIEW analytics.v_dataset_customer_clustering RENAME TO clustering_new_order_checked;',
  );
  runSql(fixedSql);
  assert.deepEqual((await contract())[0].columns, columns);

  console.log(
    'PASS: reproduced P3018/42P16 and recovered with resolve --rolled-back + migrate deploy',
  );
  console.log(
    'PASS: preserves existing rows, column order, view identity, grants and dependent views',
  );
  console.log(
    'PASS: recovery refuses unrelated failures and is harmless after a successful migration',
  );
  console.log(
    'PASS: handles both historical column orders, an absent view and repeated application',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
