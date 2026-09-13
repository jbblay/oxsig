import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOperationRun: vi.fn(),
}));

vi.mock('@/lib/operations/runtime', () => ({
  getOperationRun: mocks.getOperationRun,
}));

import { getLearnerOperationRun } from './run-view';

describe('getLearnerOperationRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps an ended reusable run destroyed while its backing machines reset', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ status: 'destroyed', environment_id: 'env-1' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    mocks.getOperationRun.mockResolvedValue({
      id: 'run-1',
      status: 'running',
      nodes: [{ id: 'node-1', status: 'running', readiness: 'ready' }],
      metadata: {},
    });

    const result = await getLearnerOperationRun({
      pool: { query } as any,
      runId: 'run-1',
      ownerId: 'owner-1',
    });

    expect(result.status).toBe('destroyed');
    expect(result.nodes[0]).toMatchObject({ status: 'destroyed', readiness: 'unavailable' });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET status='destroyed'"),
      ['run-1', 'owner-1'],
    );
  });

  it('leaves an active run under ordinary provider reconciliation', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ status: 'running', environment_id: 'env-1' }] });
    const active = {
      id: 'run-1',
      status: 'running',
      nodes: [{ id: 'node-1', status: 'running', readiness: 'ready' }],
      metadata: {},
    };
    mocks.getOperationRun.mockResolvedValue(active);

    await expect(getLearnerOperationRun({
      pool: { query } as any,
      runId: 'run-1',
      ownerId: 'owner-1',
    })).resolves.toBe(active);

    expect(query).toHaveBeenCalledTimes(1);
  });
});
