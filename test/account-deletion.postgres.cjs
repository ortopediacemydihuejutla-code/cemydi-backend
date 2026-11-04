const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const {
  AccountDeletionService,
} = require('../dist/modules/users/account-deletion.service');
const {
  RentalDocumentsService,
} = require('../dist/modules/rentals/rental-documents.service');
const {
  assertNoAccountDeletion,
} = require('../dist/modules/users/account-deletion-policy');

// Only a disposable loopback database is accepted. Never load the application's .env.
const raw = process.env.ACCOUNT_DELETION_TEST_DATABASE_URL;
if (!raw)
  throw new Error(
    'Define ACCOUNT_DELETION_TEST_DATABASE_URL con una base local aislada.',
  );
const url = new URL(raw);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
  url.pathname !== '/account_deletion_schema_test'
)
  throw new Error(
    'Esta prueba solo admite account_deletion_schema_test en loopback.',
  );
const db = new PrismaClient({ datasources: { db: { url: raw } } });

async function main() {
  const suffix = randomUUID();
  const correo = `deletion-${suffix}@example.test`;
  const account = await db.user.create({
    data: {
      nombre: 'Fixture',
      correo,
      password: 'fixture-no-login',
      emailVerifiedAt: new Date(),
      telefono: '5550000000',
      direccion: 'Fixture address',
    },
  });
  const product = await db.product.create({
    data: {
      nombre: 'Fixture',
      slug: `deletion-${suffix}`,
      marca: 'Fixture',
      modelo: 'Fixture',
      descripcion: 'Fixture',
      precio: 1,
      clasificacion: 'Fixture',
      stock: 1,
      proveedor: 'Fixture',
      tipoAdquisicion: 'RENTA',
    },
  });
  await db.review.create({
    data: {
      userId: account.id,
      productId: product.id,
      rating: 5,
      comment: 'Fixture review',
    },
  });
  await db.favorite.create({
    data: { userId: account.id, productId: product.id },
  });
  await db.shoppingCart.create({ data: { userId: account.id } });
  await db.userSession.create({
    data: {
      userId: account.id,
      tokenId: suffix,
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
  await db.loginAttempt.create({
    data: { userId: account.id, correo, success: true },
  });
  const rental = await db.rentalRequest.create({
    data: {
      userId: account.id,
      status: 'DELIVERED',
      deliveredAt: new Date(),
      depositTotal: 10,
      applicantName: 'Fixture',
      applicantEmail: correo,
      patientName: 'Fixture patient',
      deliveryAddress: 'Fixture address',
      notes: 'Fixture private note',
    },
  });
  const asset = {
    assetId: suffix,
    publicId: `fixture/${suffix}`,
    resourceType: 'RAW',
    deliveryType: 'AUTHENTICATED',
    format: 'pdf',
    bytes: 5,
  };
  await db.rentalDocument.create({
    data: {
      userId: account.id,
      ...asset,
      originalFilename: 'fixture.pdf',
      mimeType: 'application/pdf',
      pendingAssetCleanup: [
        {
          ...asset,
          assetId: `${suffix}-old`,
          publicId: `fixture/${suffix}-old`,
        },
      ],
    },
  });
  let codigo;
  let failStorage = true;
  const deletedAssets = [];
  const prisma = { asAdmin: () => db };
  const documents = new RentalDocumentsService(
    prisma,
    {},
    {
      deleteAsset: async (stored) => {
        if (failStorage) throw new Error('fixture storage failure');
        deletedAssets.push(stored.publicId);
      },
    },
    {},
  );
  const service = new AccountDeletionService(
    prisma,
    {
      sendEmail: async (message) => {
        codigo = message.text.match(/\d{8}/)[0];
      },
    },
    { passwordResetExpiresMinutes: 10, passwordResetMaxAttempts: 3 },
    documents,
  );
  await service.request(correo);
  assert.ok(codigo);
  const confirmed = await Promise.allSettled([
    service.confirm(correo, codigo),
    service.confirm(correo, codigo),
  ]);
  assert.equal(
    confirmed.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  const receipt = confirmed.find(
    (result) => result.status === 'fulfilled',
  ).value;
  assert.equal(receipt.status, 'WAITING_OBLIGATIONS');
  assert.equal(
    await db.accountDeletionRequest.count({ where: { subjectId: account.id } }),
    1,
  );
  await assert.rejects(
    db.$transaction((tx) => assertNoAccountDeletion(tx, account.id)),
  );
  await service.process(receipt.id);
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: account.id } })).activo,
    true,
  );
  await db.rentalRequest.update({
    where: { id: rental.id },
    data: { status: 'RETURNED' },
  });
  await service.process(receipt.id);
  assert.equal(
    (
      await db.accountDeletionRequest.findUniqueOrThrow({
        where: { id: receipt.id },
      })
    ).status,
    'WAITING_OBLIGATIONS',
  );
  await db.rentalRequest.update({
    where: { id: rental.id },
    data: { depositStatus: 'RETURNED' },
  });
  await service.process(receipt.id);
  const pending = await db.accountDeletionRequest.findUniqueOrThrow({
    where: { id: receipt.id },
  });
  assert.equal(pending.completedAt, null);
  assert.equal(pending.errorCode, 'CLEANUP_RETRY');
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: account.id } })).activo,
    false,
  );
  assert.equal(
    (await db.userSession.findFirstOrThrow({ where: { userId: account.id } }))
      .refreshTokenHash,
    null,
  );
  assert.equal(
    await db.rentalDocument.count({ where: { userId: account.id } }),
    1,
  );
  failStorage = false;
  await Promise.all([service.process(receipt.id), service.process(receipt.id)]);
  const done = await db.accountDeletionRequest.findUniqueOrThrow({
    where: { id: receipt.id },
  });
  assert.equal(done.status, 'COMPLETED');
  assert.equal(done.userId, null);
  assert.ok(done.completedAt);
  assert.equal(await db.user.findUnique({ where: { id: account.id } }), null);
  for (const model of [
    'review',
    'favorite',
    'shoppingCart',
    'userSession',
    'loginAttempt',
    'rentalDocument',
  ])
    assert.equal(
      await db[model].count({ where: { userId: account.id } }),
      0,
      model,
    );
  const history = await db.rentalRequest.findUniqueOrThrow({
    where: { id: rental.id },
  });
  for (const field of [
    'userId',
    'applicantName',
    'applicantEmail',
    'patientName',
    'deliveryAddress',
    'notes',
  ])
    assert.equal(history[field], null, field);
  assert.equal(history.depositTotal, 10);
  assert.ok(deletedAssets.includes(asset.publicId));
  assert.ok(deletedAssets.includes(`${asset.publicId}-old`));
  await service.process(receipt.id);
  await db.rentalRequest.delete({ where: { id: rental.id } });
  await db.accountDeletionRequest.delete({ where: { id: receipt.id } });
  await db.product.delete({ where: { id: product.id } });
  console.log(
    'PostgreSQL: OTP concurrente, obligaciones, depósitos, reintento de archivos, revocación, cascadas y anonimización aprobados.',
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
