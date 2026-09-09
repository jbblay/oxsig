import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  provider: vi.fn(() => vi.fn()),
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

  it('uses Vercel OIDC credentials when AWS_ROLE_ARN is configured', () => {
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::094525993701:role/oxsig-production-app-role';

    const config = awsClientConfig('eu-central-1');

    expect(mocks.provider).toHaveBeenCalledWith({
      roleArn: 'arn:aws:iam::094525993701:role/oxsig-production-app-role',
      clientConfig: { region: 'eu-central-1' },
    });
    expect(config.region).toBe('eu-central-1');
    expect(config.credentials).toBeTypeOf('function');
  });
});
