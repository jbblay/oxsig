import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('OXSIG_TERMINAL_BRIDGE_SECRET', 'test-operation-secret-0123456789abcdef0123456789abcdef');
});

describe('Operation access secret', () => {
  it('round-trips a credential only for the bound owner and run', async () => {
    const { openOperationAccessSecret, sealOperationAccessSecret } = await import('./access-secret');
    const sealed = sealOperationAccessSecret({ ownerId: 'owner-1', runId: 'run-1', password: 'Example42!Secret' });

    expect(sealed).not.toContain('Example42!Secret');
    expect(openOperationAccessSecret({ ownerId: 'owner-1', runId: 'run-1', sealed })).toBe('Example42!Secret');
    expect(() => openOperationAccessSecret({ ownerId: 'owner-2', runId: 'run-1', sealed })).toThrow('Invalid Operation starting credential');
    expect(() => openOperationAccessSecret({ ownerId: 'owner-1', runId: 'run-2', sealed })).toThrow('Invalid Operation starting credential');
  });

  it('requires the deployment secret to be configured strongly enough', async () => {
    vi.stubEnv('OXSIG_TERMINAL_BRIDGE_SECRET', 'short');
    const { sealOperationAccessSecret } = await import('./access-secret');
    expect(() => sealOperationAccessSecret({ ownerId: 'owner-1', runId: 'run-1', password: 'Example42!Secret' }))
      .toThrow('OXSIG_TERMINAL_BRIDGE_SECRET');
  });
});
