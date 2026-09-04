import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDatabaseConfig, isDatabaseConfigured } from './pool';

afterEach(() => vi.unstubAllEnvs());

describe('database configuration', () => {
  it('uses DATABASE_URL as the single application database setting', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://canonical');
    expect(getDatabaseConfig().connectionString).toBe('postgresql://canonical');
    expect(isDatabaseConfigured()).toBe(true);
  });

  it('reports an unconfigured database when DATABASE_URL is absent', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(isDatabaseConfigured()).toBe(false);
    expect(() => getDatabaseConfig()).toThrow('DATABASE_URL is required.');
  });
});
