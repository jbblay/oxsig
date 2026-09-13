import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  provisionPreparedBlackDomainRun: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/operations/runtime', () => ({
  OperationRuntimeError: class OperationRuntimeError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'OPERATION_RUNTIME_CONFLICT') {
      super(message);
    }
  },
}));
vi.mock('@/lib/operations/prepared-runtime', () => ({
  provisionPreparedBlackDomainRun: mocks.provisionPreparedBlackDomainRun,
}));

describe('Operation runtime registry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('LAB_AWS_ENABLED', 'true');
    mocks.provisionPreparedBlackDomainRun.mockResolvedValue({
      runId: 'run-1',
      operatorLabInstanceId: 'lab-1',
      environmentId: 'environment-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      status: 'provisioning',
    });
  });

  it('dispatches Black Domain through the prepared reusable environment when enabled', async () => {
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_PREPARED', 'true');
    const { provisionRegisteredOperationRun } = await import('./runtime-registry');
    const pool = {} as any;

    const result = await provisionRegisteredOperationRun({
      pool,
      ownerId: 'owner-1',
      slug: 'black-domain',
      mode: 'warroom',
    });

    expect(result.runId).toBe('run-1');
    expect(mocks.provisionPreparedBlackDomainRun).toHaveBeenCalledWith({
      pool,
      ownerId: 'owner-1',
      slug: 'black-domain',
      mode: 'warroom',
    });
  });

  it('fails closed instead of falling back to disposable Black Domain instances', async () => {
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_PREPARED', 'false');
    const { provisionRegisteredOperationRun } = await import('./runtime-registry');

    await expect(provisionRegisteredOperationRun({
      pool: {} as any,
      ownerId: 'owner-1',
      slug: 'black-domain',
      mode: 'practice',
    })).rejects.toMatchObject({
      code: 'OPERATION_PREPARED_ENVIRONMENT_DISABLED',
      status: 503,
    });
    expect(mocks.provisionPreparedBlackDomainRun).not.toHaveBeenCalled();
  });

  it('fails closed when AWS labs are globally disabled', async () => {
    vi.stubEnv('LAB_AWS_ENABLED', 'false');
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_PREPARED', 'true');
    const { provisionRegisteredOperationRun } = await import('./runtime-registry');

    await expect(provisionRegisteredOperationRun({
      pool: {} as any,
      ownerId: 'owner-1',
      slug: 'black-domain',
      mode: 'practice',
    })).rejects.toMatchObject({
      code: 'OPERATION_PREPARED_ENVIRONMENT_DISABLED',
      status: 503,
    });
    expect(mocks.provisionPreparedBlackDomainRun).not.toHaveBeenCalled();
  });

  it('rejects catalog missions that do not have an automated runtime', async () => {
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_PREPARED', 'true');
    const { getOperationRuntimeDriver } = await import('./runtime-registry');
    try {
      getOperationRuntimeDriver('ghost-shell');
      throw new Error('expected runtime lookup to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'OPERATION_RUNTIME_NOT_AUTOMATED', status: 409 });
    }
  });

  it('rejects unknown Operations before driver dispatch', async () => {
    vi.stubEnv('LAB_AWS_BLACK_DOMAIN_PREPARED', 'true');
    const { getOperationRuntimeDriver } = await import('./runtime-registry');
    try {
      getOperationRuntimeDriver('does-not-exist');
      throw new Error('expected runtime lookup to fail');
    } catch (error) {
      expect(error).toMatchObject({ code: 'OPERATION_NOT_FOUND', status: 404 });
    }
  });
});
