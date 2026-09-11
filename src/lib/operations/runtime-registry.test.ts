import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  provisionOperationRun: vi.fn(),
}));

vi.mock('@/lib/operations/runtime', () => ({
  provisionOperationRun: mocks.provisionOperationRun,
  OperationRuntimeError: class OperationRuntimeError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'OPERATION_RUNTIME_CONFLICT') {
      super(message);
    }
  },
}));

import { getOperationRuntimeDriver, provisionRegisteredOperationRun } from './runtime-registry';

describe('Operation runtime registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.provisionOperationRun.mockResolvedValue({
      runId: 'run-1',
      operatorLabInstanceId: 'lab-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      status: 'provisioning',
    });
  });

  it('dispatches Black Domain through its catalog-declared driver', async () => {
    const pool = {} as any;
    const result = await provisionRegisteredOperationRun({
      pool,
      ownerId: 'owner-1',
      slug: 'black-domain',
      mode: 'warroom',
    });

    expect(result.runId).toBe('run-1');
    expect(mocks.provisionOperationRun).toHaveBeenCalledWith({
      pool,
      ownerId: 'owner-1',
      slug: 'black-domain',
      mode: 'warroom',
    });
  });

  it('rejects catalog missions that do not have an automated runtime', () => {
    expect(() => getOperationRuntimeDriver('ghost-shell')).toThrow(
      expect.objectContaining({ code: 'OPERATION_RUNTIME_NOT_AUTOMATED', status: 409 }),
    );
  });

  it('rejects unknown Operations before driver dispatch', () => {
    expect(() => getOperationRuntimeDriver('does-not-exist')).toThrow(
      expect.objectContaining({ code: 'OPERATION_NOT_FOUND', status: 404 }),
    );
  });
});
