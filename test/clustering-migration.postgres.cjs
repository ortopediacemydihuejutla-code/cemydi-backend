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

function runSql(sql, expectedStatus = 0) {
  const result = spawnSync(psql, sqlArgs, {
    input: sql,
    encoding: 'utf8',
    env,
  });
  assert.equal(result.status, expectedStatus, result.stderr);
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

  const stockMigration = '20260801210000_monthly_demand_stock_semantics';
  const stockSql = fs.readFileSync(
    path.join(root, 'prisma/migrations', stockMigration, 'migration.sql'),
    'utf8',
  );
  runSql(
    'CREATE TABLE analytics.monthly_source (product_id integer, stock integer); INSERT INTO analytics.monthly_source VALUES (1, 17); CREATE VIEW analytics.v_dataset_monthly_demand AS SELECT product_id, stock AS stock_at_month_start FROM analytics.monthly_source; GRANT SELECT ON analytics.v_dataset_monthly_demand TO PUBLIC; CREATE VIEW analytics.monthly_dependent AS SELECT stock_at_month_start FROM analytics.v_dataset_monthly_demand;',
  );
  const stockIdentity =
    await db.$queryRaw`SELECT oid::text AS oid, relacl::text AS grants FROM pg_class WHERE oid = 'analytics.v_dataset_monthly_demand'::regclass`;
  const stockDirectory = path.join(migrations, stockMigration);
  fs.mkdirSync(stockDirectory);
  const stockFile = path.join(stockDirectory, 'migration.sql');
  fs.writeFileSync(
    stockFile,
    'ALTER VIEW analytics.v_dataset_monthly_demand RENAME COLUMN stock_available TO stock_at_month_start;',
  );
  const stockFailure = prisma(['migrate', 'deploy'], 1);
  assert.match(stockFailure, /P3018/);
  assert.match(stockFailure, /42703/);
  fs.writeFileSync(stockFile, stockSql);

  // A missing/unknown contract must not be hidden by resetting migration state.
  runSql(
    'ALTER VIEW analytics.v_dataset_monthly_demand RENAME TO monthly_contract_checked; CREATE VIEW analytics.v_dataset_monthly_demand AS SELECT stock AS unknown_stock FROM analytics.monthly_source;',
  );
  assert.match(recover(1), /contrato de stock ambiguo/);
  assert.equal(
    (
      await db.$queryRaw`SELECT rolled_back_at FROM public._prisma_migrations WHERE migration_name = ${stockMigration} AND finished_at IS NULL`
    )[0].rolled_back_at,
    null,
  );
  runSql(
    'ALTER VIEW analytics.v_dataset_monthly_demand RENAME TO monthly_unknown_checked; ALTER VIEW analytics.monthly_contract_checked RENAME TO v_dataset_monthly_demand;',
  );
  recover();
  prisma(['migrate', 'deploy']);
  assert.deepEqual(
    await db.$queryRaw`SELECT oid::text AS oid, relacl::text AS grants FROM pg_class WHERE oid = 'analytics.v_dataset_monthly_demand'::regclass`,
    stockIdentity,
  );
  assert.equal(
    (
      await db.$queryRaw`SELECT stock_at_month_start FROM analytics.monthly_dependent`
    )[0].stock_at_month_start,
    17,
  );
  assert.match(recover(), /No hay un fallo pendiente/);
  runSql(stockSql);

  runSql(
    'ALTER VIEW analytics.v_dataset_monthly_demand RENAME TO monthly_current_checked; CREATE VIEW analytics.v_dataset_monthly_demand AS SELECT product_id, stock AS stock_available FROM analytics.monthly_source; CREATE VIEW analytics.monthly_legacy_dependent AS SELECT stock_available AS value FROM analytics.v_dataset_monthly_demand;',
  );
  runSql(stockSql);
  runSql(stockSql);
  assert.equal(
    (
      await db.$queryRaw`SELECT stock_at_month_start FROM analytics.v_dataset_monthly_demand`
    )[0].stock_at_month_start,
    17,
  );
  assert.equal(
    (
      await db.$queryRaw`SELECT value FROM analytics.monthly_legacy_dependent`
    )[0].value,
    17,
  );
  runSql(
    'ALTER VIEW analytics.v_dataset_monthly_demand RENAME TO monthly_legacy_checked; CREATE VIEW analytics.v_dataset_monthly_demand AS SELECT stock AS stock_available, stock AS stock_at_month_start FROM analytics.monthly_source;',
  );
  runSql(stockSql, 3);
  assert.equal(
    (await db.$queryRaw`SELECT stock FROM analytics.monthly_source`)[0].stock,
    17,
  );

  // Reproduce the unquoted FK name from the actual historical rental migration.
  const deletionMigration = '20261103193000_account_deletion';
  const deletionSql = fs.readFileSync(
    path.join(root, 'prisma/migrations', deletionMigration, 'migration.sql'),
    'utf8',
  );
  const originalDeletionSql = fs.readFileSync(
    path.join(__dirname, 'fixtures/account-deletion-original.sql'),
    'utf8',
  );
  runSql(`
    ALTER TABLE management.rental_requests ALTER COLUMN "userId" SET NOT NULL;
    ALTER TABLE management.rental_requests
      ADD CONSTRAINT rental_requests_userId_fkey FOREIGN KEY ("userId") REFERENCES accounts.users(id) ON DELETE CASCADE,
      ADD COLUMN "approvedById" integer,
      ADD CONSTRAINT rental_requests_approvedById_fkey FOREIGN KEY ("approvedById") REFERENCES accounts.users(id) ON DELETE SET NULL;
    INSERT INTO management.rental_requests (id, "userId", "approvedById", subtotal)
      VALUES ('deletion-migration-sentinel', 1, 1, 123);
  `);
  const approvalFkBefore = await db.$queryRaw`
    SELECT oid::text AS oid FROM pg_constraint
    WHERE conrelid = 'management.rental_requests'::regclass
      AND conname = 'rental_requests_approvedbyid_fkey'
  `;
  assert.equal(approvalFkBefore.length, 1);
  fs.mkdirSync(path.join(migrations, deletionMigration));
  const deletionFile = path.join(
    migrations,
    deletionMigration,
    'migration.sql',
  );
  fs.writeFileSync(deletionFile, originalDeletionSql);
  const deletionFailure = prisma(['migrate', 'deploy'], 1);
  assert.match(deletionFailure, /P3018/);
  assert.match(deletionFailure, /42704/);
  assert.match(deletionFailure, /rental_requests_userId_fkey/);
  assert.match(recover(1), /Publica primero/);
  fs.writeFileSync(deletionFile, deletionSql);
  const deletionState = (
    await db.$queryRaw`SELECT id, logs FROM public._prisma_migrations WHERE migration_name = ${deletionMigration} AND finished_at IS NULL AND rolled_back_at IS NULL`
  )[0];
  assert.ok(deletionState);
  await db.$executeRaw`UPDATE public._prisma_migrations SET logs = '42704 ATExecDropConstraint: an unrelated constraint is missing' WHERE id = ${deletionState.id}`;
  assert.match(recover(1), /fallo distinto/);
  assert.equal(
    (
      await db.$queryRaw`SELECT rolled_back_at FROM public._prisma_migrations WHERE id = ${deletionState.id}`
    )[0].rolled_back_at,
    null,
  );
  await db.$executeRaw`UPDATE public._prisma_migrations SET logs = ${deletionState.logs} WHERE id = ${deletionState.id}`;

  // Simulate a partially completed run, retaining a real request row on retry.
  const deletionTable = await db.$queryRaw`
    SELECT to_regclass('accounts.account_deletion_requests')::text AS name
  `;
  if (!deletionTable[0].name) {
    runSql(
      originalDeletionSql.slice(0, originalDeletionSql.indexOf('ALTER TABLE')),
    );
  }
  runSql(`
    INSERT INTO accounts.account_deletion_requests (id, "userId", "subjectId", "subjectCreatedAt")
      VALUES ('request-sentinel', 1, 1, CURRENT_TIMESTAMP);
  `);
  recover();
  prisma(['migrate', 'deploy']);
  assert.match(recover(), /No hay un fallo pendiente/);
  assert.deepEqual(
    await db.$queryRaw`SELECT oid::text AS oid FROM pg_constraint WHERE conrelid = 'management.rental_requests'::regclass AND conname = 'rental_requests_approvedbyid_fkey'`,
    approvalFkBefore,
    'Only the account-owner FK may be replaced; the approval FK must retain its identity',
  );
  const ownerFk = await db.$queryRaw`
    SELECT conname, confdeltype::text AS action FROM pg_constraint
    WHERE conrelid = 'management.rental_requests'::regclass
      AND conname IN ('rental_requests_userId_fkey', 'rental_requests_userid_fkey')
  `;
  assert.deepEqual(ownerFk, [
    { conname: 'rental_requests_userId_fkey', action: 'n' },
  ]);
  assert.equal(
    (
      await db.$queryRaw`SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'management' AND table_name = 'rental_requests' AND column_name = 'userId'`
    )[0].is_nullable,
    'YES',
  );
  assert.equal(
    (
      await db.$queryRaw`SELECT count(*)::integer AS count FROM accounts.account_deletion_requests WHERE id = 'request-sentinel'`
    )[0].count,
    1,
  );
  // Also support schemas generated by Prisma, custom FK names, and absent FKs.
  runSql(deletionSql);
  runSql(
    'ALTER TABLE management.rental_requests RENAME CONSTRAINT "rental_requests_userId_fkey" TO custom_rental_owner_fk;',
  );
  runSql(deletionSql);
  runSql(
    'ALTER TABLE management.rental_requests DROP CONSTRAINT "rental_requests_userId_fkey";',
  );
  runSql(deletionSql);
  runSql('DELETE FROM accounts.users WHERE id = 1;');
  assert.deepEqual(
    await db.$queryRaw`SELECT "userId", "approvedById", subtotal FROM management.rental_requests WHERE id = 'deletion-migration-sentinel'`,
    [{ userId: null, approvedById: null, subtotal: 123 }],
    'Account removal must retain the rental and its financial history',
  );
  assert.equal(
    (
      await db.$queryRaw`SELECT "userId" FROM accounts.account_deletion_requests WHERE id = 'request-sentinel'`
    )[0].userId,
    null,
  );
  const deletionStates = await db.$queryRaw`
    SELECT finished_at, rolled_back_at FROM public._prisma_migrations WHERE migration_name = ${deletionMigration}
  `;
  assert.equal(
    deletionStates.filter((state) => state.finished_at !== null).length,
    1,
  );
  assert.equal(
    deletionStates.filter((state) => state.rolled_back_at !== null).length,
    1,
  );

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
  console.log(
    'PASS: reproduced P3018/42703, recovered the stock migration and preserved rows, identity, grants and dependencies',
  );
  console.log(
    'PASS: stock rename supports both names, is repeatable and rejects ambiguous/unknown contracts',
  );
  console.log(
    'PASS: reproduced P3018/42704 from the historical unquoted rental FK and recovered a partial migration through Prisma',
  );
  console.log(
    'PASS: owner FK discovery supports historical, generated, custom and absent names, preserves approval FK identity and retains rental/request rows',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
