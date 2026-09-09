import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  provider: vi.fn(() => vi.fn(async () => ({
    accessKeyId: 'temporary-access-key',
    secretAccessKey: 'temporary-secret-key',
    sessionToken: 'temporary-session-token',
  }))),
}));

vi.mock('server-only', () => ({}));
vi.mock('@vercel/functions/oidc', () => ({
  awsCredentialsProvider: mocks.provider,
}));

import { awsClientConfig } from './client-config';

afterEach(() => {
  delete process.env.AWS_ROLE_ARN;
  mocks.provider.mockClear();
});

describe('awsClientConfig', () => {
  it('preserves the AWS SDK default credential chain when AWS_ROLE_ARN is absent', () => {
    const config = awsClientConfig('eu-central-1');

    expect(config).toEqual({ region: 'eu-central-1' });
    expect('credentials' in config).toBe(false);
    expect(mocks.provider).not.toHaveBeenCalled();
  });

  it('lazy-loads Vercel OIDC credentials when AWS_ROLE_ARN is configured', async () => {
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::094525993701:role/oxsig-production-app-role';

    const config = awsClientConfig('eu-central-1');

    expect(config.region).toBe('eu-central-1');
    expect('credentials' in config).toBe(true);
    expect(mocks.provider).not.toHaveBeenCalled();
    if (!('credentials' in config)) throw new Error('Expected OIDC credentials provider');

    await config.credentials();

    expect(mocks.provider).toHaveBeenCalledWith({
      roleArn: 'arn:aws:iam::094525993701:role/oxsig-production-app-role',
      clientConfig: { region: 'eu-central-1' },
    });
  });
});
