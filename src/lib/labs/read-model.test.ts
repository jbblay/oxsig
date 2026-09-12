import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getConfiguredLabCapabilities, labStatusFreshness } from './read-model';

describe('Lab status read-model freshness', () => {
  it('marks missing, old, future-skewed, or warned observations stale', () => {
    const now = Date.parse('2026-09-12T08:00:00.000Z');

    expect(labStatusFreshness({ runtime_observed_at: null, reconciliation_warning: null }, now).stale).toBe(true);
    expect(labStatusFreshness({
      runtime_observed_at: '2026-09-12T07:58:00.000Z',
      reconciliation_warning: null,
    }, now).stale).toBe(true);
    expect(labStatusFreshness({
      runtime_observed_at: '2026-09-12T08:00:30.000Z',
      reconciliation_warning: null,
    }, now).stale).toBe(false);
    expect(labStatusFreshness({
      runtime_observed_at: '2026-09-12T08:00:00.000Z',
      reconciliation_warning: 'provider unavailable',
    }, now)).toMatchObject({ stale: true, reconciliationWarning: 'provider unavailable' });
  });
});

describe('Lab deployment capability read model', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reflects deployment configuration changes without a long-lived capability cache', () => {
    vi.stubEnv('LAB_AWS_ENABLED', 'true');
    vi.stubEnv('LAB_AWS_SUBNET_ID', 'subnet-123');
    vi.stubEnv('LAB_AWS_SECURITY_GROUP_ID', 'sg-123');
    vi.stubEnv('LAB_AWS_INSTANCE_PROFILE', 'lab-profile');

    expect(getConfiguredLabCapabilities()).toMatchObject({
      provider: 'aws-ec2',
      configured: true,
      supportsTerminal: true,
    });

    vi.stubEnv('LAB_AWS_ENABLED', 'false');
    expect(getConfiguredLabCapabilities()).toMatchObject({
      provider: 'unconfigured',
      configured: false,
      supportsTerminal: false,
    });
  });
});
