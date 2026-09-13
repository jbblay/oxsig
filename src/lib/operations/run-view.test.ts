import { describe, expect, it, vi } from 'vitest';
import { getLearnerOperationRun, OperationRunReadError } from './run-view';

function poolWith(runRows: any[], nodeRows: any[] = []) {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: runRows })
    .mockResolvedValueOnce({ rows: nodeRows });
  return { pool: { query } as any, query };
}

describe('getLearnerOperationRun', () => {
  it('returns the durable learner view without provider reconciliation or writes', async () => {
    const { pool, query } = poolWith([
      {
        id: 'run-1',
        operation_slug: 'black-domain',
        mode: 'practice',
        status: 'destroyed',
        operator_lab_instance_id: 'lab-1',
        expires_at: '2026-09-13T12:00:00.000Z',
        metadata: {
          readinessVersion: 1,
          lifecycle: 'prepared-environment',
          initialAccess: { username: 'BLACKDOMAIN\\labuser', passwordSecret: 'sealed-value' },
        },
        last_error: null,
      },
    ], [
      {
        id: 'node-1',
        node_key: 'workstation',
        label: 'Windows Workstation',
        role: 'target',
        os_family: 'windows',
        status: 'destroyed',
        private_ip: '10.0.0.10',
        lab_instance_id: null,
        metadata: { bootstrapReadyAt: '2026-09-13T11:00:00.000Z' },
        last_error: null,
      },
    ]);

    const result = await getLearnerOperationRun({ pool, runId: 'run-1', ownerId: 'owner-1' });

    expect(result).toMatchObject({
      id: 'run-1',
      status: 'destroyed',
      metadata: {
        lifecycle: 'prepared-environment',
        initialAccess: { username: 'BLACKDOMAIN\\labuser', available: true },
      },
      nodes: [{ status: 'destroyed', computeStatus: 'destroyed', readiness: 'unavailable' }],
    });
    expect(result.metadata.initialAccess).not.toHaveProperty('passwordSecret');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([sql]) => !String(sql).trimStart().toUpperCase().startsWith('UPDATE'))).toBe(true);
  });

  it('uses persisted readiness metadata for a transitional node', async () => {
    const { pool } = poolWith([
      {
        id: 'run-1',
        operation_slug: 'black-domain',
        mode: 'practice',
        status: 'provisioning',
        operator_lab_instance_id: 'lab-1',
        expires_at: '2026-09-13T12:00:00.000Z',
        metadata: { readinessVersion: 1 },
        last_error: null,
      },
    ], [
      {
        id: 'node-1',
        node_key: 'dc',
        label: 'Domain Controller',
        role: 'infrastructure',
        os_family: 'windows',
        status: 'provisioning',
        private_ip: '10.0.0.11',
        lab_instance_id: null,
        metadata: { readinessReason: 'probe-pending', readinessError: 'guest not ready' },
        last_error: null,
      },
    ]);

    const result = await getLearnerOperationRun({ pool, runId: 'run-1', ownerId: 'owner-1' });
    expect(result.nodes[0]).toMatchObject({
      status: 'provisioning',
      computeStatus: 'provisioning',
      readiness: 'probe-pending',
      readinessError: 'guest not ready',
    });
  });

  it('fails with a typed not-found error for another owner or missing run', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const pool = { query } as any;

    await expect(getLearnerOperationRun({ pool, runId: 'run-1', ownerId: 'owner-1' }))
      .rejects.toMatchObject<Partial<OperationRunReadError>>({ status: 404, code: 'OPERATION_RUN_NOT_FOUND' });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
