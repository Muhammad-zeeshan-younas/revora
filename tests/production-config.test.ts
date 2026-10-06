import { describe, expect, it } from 'vitest';
import { validateProductionEnvironment } from '../server/config/production';

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://revora:password@database.internal:5432/revora',
  APP_ORIGIN: 'https://revora.example.com',
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'Revora <accounts@example.com>',
  MFA_ENCRYPTION_KEY: 'a'.repeat(64),
  OPERATIONS_TOKEN: 'b'.repeat(32),
};

describe('production configuration', () => {
  it('allows development without production credentials', () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('requires core production settings before the API starts', () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL, APP_ORIGIN, RESEND_API_KEY, EMAIL_FROM, MFA_ENCRYPTION_KEY, OPERATIONS_TOKEN',
    );
  });

  it('rejects local storage, insecure origins, and unusable encryption keys', () => {
    expect(() =>
      validateProductionEnvironment({ ...production, DATABASE_URL: 'sqlite://local' }),
    ).toThrow('PostgreSQL');
    expect(() =>
      validateProductionEnvironment({ ...production, APP_ORIGIN: 'http://revora.example.com' }),
    ).toThrow('HTTPS');
    expect(() =>
      validateProductionEnvironment({ ...production, MFA_ENCRYPTION_KEY: 'short' }),
    ).toThrow('32 bytes');
  });

  it('accepts a complete production configuration', () => {
    expect(() => validateProductionEnvironment(production)).not.toThrow();
  });
});
