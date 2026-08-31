import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDemoModeEnabled } from './demo';

describe('demo mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is enabled automatically on Vercel Preview', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');

    expect(isDemoModeEnabled()).toBe(true);
  });

  it('cannot be enabled on production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('OXSIG_DEMO_MODE', 'true');

    expect(isDemoModeEnabled()).toBe(false);
  });

  it('requires an explicit opt-in during local development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('OXSIG_DEMO_MODE', 'true');

    expect(isDemoModeEnabled()).toBe(true);
  });
});
