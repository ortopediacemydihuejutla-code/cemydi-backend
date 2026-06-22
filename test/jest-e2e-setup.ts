if (!process.env.JWT_SECRET?.trim()) {
  process.env.JWT_SECRET = 'test-e2e-jwt-secret-do-not-use-in-production-32';
}

if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5432/cemydi_test?schema=public';
}

if (!process.env.NODE_ENV?.trim()) {
  process.env.NODE_ENV = 'test';
}
