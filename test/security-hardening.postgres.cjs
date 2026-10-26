const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient, AuthTokenPurpose } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const bcrypt = require('bcrypt');
const {
  AuthConfigService,
} = require('../dist/modules/auth/services/auth-config.service');
const {
  AuthSessionService,
} = require('../dist/modules/auth/services/auth-session.service');
const {
  AuthGoogleService,
} = require('../dist/modules/auth/services/auth-google.service');
const {
  AuthLoginService,
} = require('../dist/modules/auth/services/auth-login.service');
const {
  AuthPasswordResetService,
} = require('../dist/modules/auth/services/auth-password-reset.service');
const {
  AuthEmailVerificationService,
} = require('../dist/modules/auth/services/auth-email-verification.service');
const {
  AccountSecurityService,
} = require('../dist/modules/users/account-security.service');
const {
  hashAuthValue,
} = require('../dist/modules/auth/utils/auth-crypto.util');

// Never fall back to DATABASE_URL or the application's .env file.
const testUrl = new URL(process.env.SECURITY_TEST_DATABASE_URL || 'invalid:');
assert.equal(testUrl.protocol, 'postgresql:');
assert.equal(testUrl.hostname, '127.0.0.1');
assert.equal(testUrl.username, 'test_security');
assert.equal(testUrl.pathname, '/security_hardening_test');
assert.ok(testUrl.port, 'An explicit isolated PostgreSQL port is required');

const prisma = new PrismaClient({
  datasources: { db: { url: testUrl.toString() } },
});
prisma.asAdmin = () => prisma;
const config = new AuthConfigService(
  new ConfigService({
    JWT_SECRET: 'isolated-security-test-secret-do-not-use-in-production',
    FRONTEND_URL: 'https://cemydi.example',
  }),
);
const jwt = new JwtService({ secret: config.jwtSecret });
const sessions = new AuthSessionService(prisma, jwt, config);
const sentMail = [];
const mail = {
  sendEmail: async (message) => {
    sentMail.push(message);
  },
};
const security = new AccountSecurityService(prisma, mail, config);
const reset = new AuthPasswordResetService(prisma, {}, config, sessions);
const verify = new AuthEmailVerificationService(prisma, {}, config);
const suffix = randomUUID();

async function createUser(label, verified = true) {
  return prisma.user.create({
    data: {
      nombre: label,
      correo: `${label}-${suffix}@example.invalid`,
      password: await bcrypt.hash('Current123!', 4),
      emailVerifiedAt: verified ? new Date() : null,
    },
  });
}

async function createChallenge(user, purpose, correo = user.correo) {
  const raw = randomUUID();
  const token = await prisma.authToken.create({
    data: {
      userId: user.id,
      correo,
      purpose,
      tokenHash: hashAuthValue(raw),
      expiresAt: new Date(Date.now() + 300_000),
    },
  });
  return { raw, token };
}

async function main() {
  const sentinel = await prisma.user.findUnique({
    where: { correo: 'migration-sentinel@example.invalid' },
  });
  assert.equal(
    sentinel?.password,
    'preserve-this-value',
    'Migration must preserve pre-existing data',
  );
  const product = await prisma.product.create({
    data: {
      nombre: 'Test product',
      slug: `security-test-${suffix}`,
      marca: 'Test',
      modelo: 'Test',
      descripcion: 'Test',
      precio: 10,
      clasificacion: 'Test',
      stock: 1,
      proveedor: 'Test',
      tipoAdquisicion: 'VENTA',
    },
  });
  await prisma.favorite.create({
    data: { userId: sentinel.id, productId: product.id },
  });
  await assert.rejects(
    prisma.favorite.create({
      data: { userId: sentinel.id, productId: product.id },
    }),
    { code: 'P2002' },
  );

  const pending = await createUser('google-pending', false);
  const plantedReset = await createChallenge(
    pending,
    AuthTokenPurpose.PASSWORD_RESET_CODE,
  );
  const google = new AuthGoogleService(prisma, config, sessions);
  await google.createSessionFromGoogleProfile({
    email: pending.correo,
    email_verified: true,
  });
  const recovered = await prisma.user.findUniqueOrThrow({
    where: { id: pending.id },
  });
  assert.ok(recovered.emailVerifiedAt);
  assert.equal(await bcrypt.compare('Current123!', recovered.password), false);
  assert.ok(
    (
      await prisma.authToken.findUniqueOrThrow({
        where: { id: plantedReset.token.id },
      })
    ).consumedAt,
  );
  assert.equal(
    await prisma.userSession.count({
      where: { userId: pending.id, endedAt: null },
    }),
    1,
  );

  const rollback = await createUser('google-rollback', false);
  const failingGoogle = new AuthGoogleService(prisma, config, {
    createSessionForUser: async () => {
      throw new Error('simulated session failure');
    },
  });
  await assert.rejects(
    failingGoogle.createSessionFromGoogleProfile({
      email: rollback.correo,
      email_verified: true,
    }),
  );
  const unchanged = await prisma.user.findUniqueOrThrow({
    where: { id: rollback.id },
  });
  assert.equal(unchanged.password, rollback.password);
  assert.equal(unchanged.emailVerifiedAt, null);

  const owner = await createUser('email-change');
  const session = await sessions.createSessionForUser(owner);
  const identity = { ...jwt.decode(session.accessToken), id: owner.id };
  const oldReset = await createChallenge(
    owner,
    AuthTokenPurpose.PASSWORD_RESET_CODE,
  );
  await security.requestEmailChange(identity, {
    currentPassword: 'Current123!',
    newEmail: `changed-${suffix}@example.invalid`,
  });
  const code = /\d{8}/.exec(sentMail.at(-1).text)?.[0];
  assert.ok(code);
  await security.confirmEmailChange(identity, {
    newEmail: `changed-${suffix}@example.invalid`,
    codigo: code,
  });
  await assert.rejects(
    reset.confirmPasswordResetToken({
      token: oldReset.raw,
      newPassword: 'Attacker123!',
    }),
  );
  const staleEmailToken = await createChallenge(
    owner,
    AuthTokenPurpose.PASSWORD_RESET_CODE,
  );
  await assert.rejects(
    reset.confirmPasswordResetToken({
      token: staleEmailToken.raw,
      newPassword: 'Attacker123!',
    }),
  );
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).password,
    owner.password,
  );
  assert.equal(
    await prisma.userSession.count({
      where: { userId: owner.id, endedAt: null },
    }),
    0,
  );

  const racingUser = await createUser('racing-login');
  const racingReset = await createChallenge(
    racingUser,
    AuthTokenPurpose.PASSWORD_RESET_CODE,
  );
  let releaseLogin;
  const released = new Promise((resolve) => {
    releaseLogin = resolve;
  });
  let reachedPersistence;
  const reached = new Promise((resolve) => {
    reachedPersistence = resolve;
  });
  const delayedLogin = new AuthLoginService(
    prisma,
    config,
    {
      createSessionForUser: async (snapshot) => {
        reachedPersistence();
        await released;
        return sessions.createSessionForUser(snapshot);
      },
    },
    {},
  );
  const inFlight = delayedLogin.login({
    correo: racingUser.correo,
    password: 'Current123!',
  });
  await reached;
  try {
    await reset.confirmPasswordResetToken({
      token: racingReset.raw,
      newPassword: 'ChangedSecure123!',
    });
  } finally {
    releaseLogin();
  }
  await assert.rejects(inFlight, /Credenciales invalidas/);
  assert.equal(
    await prisma.userSession.count({
      where: { userId: racingUser.id, endedAt: null },
    }),
    0,
  );

  const oneTimeUser = await createUser('single-use-reset');
  const oneTimeReset = await createChallenge(
    oneTimeUser,
    AuthTokenPurpose.PASSWORD_RESET_CODE,
  );
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      reset.confirmPasswordResetToken({
        token: oneTimeReset.raw,
        newPassword: 'ChangedSecure123!',
      }),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );

  const pendingVerification = await createUser(
    'single-use-verification',
    false,
  );
  const verification = await createChallenge(
    pendingVerification,
    AuthTokenPurpose.EMAIL_VERIFICATION_LINK,
  );
  const verified = await Promise.allSettled(
    [1, 2].map(() => verify.confirmEmailVerification(verification.raw)),
  );
  assert.equal(
    verified.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  const wrongEmail = await createChallenge(
    pendingVerification,
    AuthTokenPurpose.EMAIL_VERIFICATION_LINK,
    'old@example.invalid',
  );
  await assert.rejects(verify.confirmEmailVerification(wrongEmail.raw));

  console.log(
    'PASS: additive favorites migration preserves data and enforces uniqueness',
  );
  console.log(
    'PASS: Google recovery invalidates planted credentials and rolls back atomically',
  );
  console.log(
    'PASS: email changes revoke recovery links and reject old-email challenges',
  );
  console.log(
    'PASS: an in-flight password login cannot outlive a credential reset',
  );
  console.log(
    'PASS: concurrent recovery and verification challenges are consumed once',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
