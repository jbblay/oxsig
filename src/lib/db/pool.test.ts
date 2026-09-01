import { afterEach, describe, expect, it, vi } from 'vitest';

import { getHostedDatabaseUrl, isDatabaseConfigured } from './pool';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hosted database configuration', () => {
  it('prefers the canonical DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://canonical');
    vi.stubEnv('DATABASE_POSTGRES_URL', 'postgresql://vercel-neon');

    expect(getHostedDatabaseUrl()).toBe('postgresql://canonical');
  });

  it('accepts Vercel Postgres and Neon URL aliases', () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DATABASE_POSTGRES_URL', '');
    vi.stubEnv('POSTGRES_URL', 'postgresql://vercel-postgres');
    expect(getHostedDatabaseUrl()).toBe('postgresql://vercel-postgres');
    vi.stubEnv('POSTGRES_URL', '');
    vi.stubEnv('NEON_DATABASE_URL', 'postgresql://neon');
    expect(getHostedDatabaseUrl()).toBe('postgresql://neon');
  });

  it('accepts the Vercel Neon pooled URL without a duplicate secret', () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DATABASE_POSTGRES_URL', 'postgresql://vercel-neon');
    vi.stubEnv('NODE_ENV', 'production');

    expect(getHostedDatabaseUrl()).toBe('postgresql://vercel-neon');
    expect(isDatabaseConfigured()).toBe(true);
  });
});
