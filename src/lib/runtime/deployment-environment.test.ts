import { describe, expect, it } from 'vitest';
import { deploymentEnvironment, isProductionDeployment } from './deployment-environment';
import { resetEnabled } from '@/lib/account/test-reset-policy';

describe('deploymentEnvironment', () => {
  it.each([
    [{ NODE_ENV: 'production' }, 'production'],
    [{ NODE_ENV: 'production', VERCEL_ENV: 'preview' }, 'preview'],
    [{ NODE_ENV: 'production', VERCEL_ENV: 'production' }, 'production'],
    [{ NODE_ENV: 'production', OXSIG_DEPLOY_ENV: 'staging' }, 'preview'],
    [{ NODE_ENV: 'production', OXSIG_DEPLOY_ENV: 'something-new' }, 'production'],
    [{ NODE_ENV: 'development' }, 'development'],
    [{ NODE_ENV: 'test' }, 'test'],
    [{}, 'development'],
  ] as const)('maps %j to %s', (env, expected) => {
    expect(deploymentEnvironment(env)).toBe(expected);
  });

  it('treats an AWS production build without Vercel variables as production', () => {
    expect(isProductionDeployment({ NODE_ENV: 'production' })).toBe(true);
  });

  it('never lets OXSIG_DEPLOY_ENV downgrade an explicit Vercel production marker', () => {
    expect(isProductionDeployment({ NODE_ENV: 'production', VERCEL_ENV: 'production', OXSIG_DEPLOY_ENV: 'preview' })).toBe(true);
  });
});

describe('test-account reset policy', () => {
  it('is disabled in production even when the test flag is set', () => {
    expect(resetEnabled({ NODE_ENV: 'production', OXSIG_TEST_RESET_ENABLED: 'true' })).toBe(false);
    expect(resetEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'production', OXSIG_TEST_RESET_ENABLED: 'true' })).toBe(false);
  });

  it('remains available on preview, staging and development deployments', () => {
    expect(resetEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(true);
    expect(resetEnabled({ NODE_ENV: 'production', OXSIG_DEPLOY_ENV: 'staging' })).toBe(true);
    expect(resetEnabled({ NODE_ENV: 'development' })).toBe(true);
  });
});
