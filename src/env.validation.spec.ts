import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const baseDevEnv = {
    NODE_ENV: 'development',
    JWT_SECRET: 'x'.repeat(32),
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/cemydi',
  };

  it('requires DATABASE_URL', () => {
    expect(() =>
      validateEnv({
        JWT_SECRET: 'x'.repeat(32),
      }),
    ).toThrow('DATABASE_URL es obligatorio');
  });

  it('accepts a minimal development configuration', () => {
    expect(validateEnv({ ...baseDevEnv })).toMatchObject({
      DATABASE_URL: baseDevEnv.DATABASE_URL,
    });
  });

  it('rejects prisma:// database urls', () => {
    expect(() =>
      validateEnv({
        ...baseDevEnv,
        DATABASE_URL: 'prisma://accelerate.prisma-data.net/?api_key=test',
      }),
    ).toThrow('DATABASE_URL usa Prisma Accelerate/Data Proxy');
  });

  it('requires production integrations', () => {
    expect(() =>
      validateEnv({
        ...baseDevEnv,
        NODE_ENV: 'production',
      }),
    ).toThrow('CORS_ORIGIN es obligatorio en production');
  });
});
