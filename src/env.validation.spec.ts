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

  it('accepts Brevo HTTPS configuration in production', () => {
    const productionEnv = {
      ...baseDevEnv,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://cemydi.example',
      BACKEND_PUBLIC_URL: 'https://api.cemydi.example',
      FRONTEND_URL: 'https://cemydi.example',
      CLOUDINARY_URL: 'cloudinary://key:secret@cloud',
      BREVO_API_KEY: 'xkeysib-test',
      EMAIL_FROM: 'sender@example.com',
      GOOGLE_SIGNIN_CLIENT_ID: 'google-client',
      GOOGLE_SIGNIN_CLIENT_SECRET: 'google-secret',
    };

    expect(validateEnv(productionEnv)).toMatchObject({
      BREVO_API_KEY: 'xkeysib-test',
      EMAIL_FROM: 'sender@example.com',
      FRONTEND_URL: 'https://cemydi.example',
    });
  });

  it('rejects an invalid Brevo sender address', () => {
    expect(() =>
      validateEnv({
        ...baseDevEnv,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://cemydi.example',
        BACKEND_PUBLIC_URL: 'https://api.cemydi.example',
        FRONTEND_URL: 'https://cemydi.example',
        CLOUDINARY_URL: 'cloudinary://key:secret@cloud',
        BREVO_API_KEY: 'xkeysib-test',
        EMAIL_FROM: 'not-an-email',
        GOOGLE_SIGNIN_CLIENT_ID: 'google-client',
        GOOGLE_SIGNIN_CLIENT_SECRET: 'google-secret',
      }),
    ).toThrow('EMAIL_FROM debe ser un correo electrónico válido');
  });
});
