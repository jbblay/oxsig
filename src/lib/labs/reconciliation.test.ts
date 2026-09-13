import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { LabInstanceStatus } from './types';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/labs/aws-runtime', () => ({
  describeLabVmStates: vi.fn(),
  destroyLabVm: vi.fn(),
}));

import { reconcileOwnedLabReadModel } from './reconciliation';

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const labId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const externalId = 'i-0123456789abcdef0';

function createPool(rows: Array<Record<string, unknown>>, lockAcquired = true) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: lockAcquired }] };
    if (sql.includes('FROM lab_instances') && sql.includes("runtime_provider='aws-ec2'")) return { rows };
    if (sql.includes('pg_advisory_unlock')) return { rows: [{ pg_advisory_unlock: true }] };
    if (sql.includes('UPDATE lab_instances')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected query: ${sql}`);
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, query };
}

describe('reconcileOwnedLabReadModel', () => {
  const row = {
    id: labId,
    status: 'running',
    runtime_provider: 'aws-ec2',
    runtime_external_id: externalId,
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime_observed_at: '2026-09-12T07:00:00.000Z',
    reconciliation_warning: null,
  };

  it('preserves persisted state and records a warning when AWS describe fails, then recovers later', async () => {
    const { pool, query } = createPool([row]);
    const describeStates = vi.fn()
      .mockRejectedValueOnce(new Error('slow provider failed'))
      .mockResolvedValueOnce(new Map([[externalId, 'stopped']]));
    const destroyVm = vi.fn();
    const now = vi.fn(() => new Date('2026-09-12T08:00:00.000Z'));

    const failed = await reconcileOwnedLabReadModel(pool, ownerId, { describeStates, destroyVm, now });
    expect(failed).toMatchObject({ failed: 1, reconciled: 0, skipped: false });
    const candidateSelect = query.mock.calls.find(([sql]) => String(sql).includes('FROM lab_instances'));
    expect(String(candidateSelect?.[0])).toContain("NOT (metadata ? 'environmentId')");
    expect(query.mock.calls.some(([sql]) => String(sql).includes('SET reconciliation_warning=$1'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('runtime_observed_at=$2::timestamptz'))).toBe(false);

    await Promise.resolve();
    query.mockClear();
    const recovered = await reconcileOwnedLabReadModel(pool, ownerId, { describeStates, destroyVm, now });

    expect(recovered).toMatchObject({ failed: 0, reconciled: 1, skipped: false });
    expect(describeStates).toHaveBeenCalledTimes(2);
    const update = query.mock.calls.find(([sql]) => String(sql).includes('runtime_observed_at=$2::timestamptz'));
    expect(update).toBeTruthy();
    expect(update?.[1]).toEqual([
      'stopped',
      '2026-09-12T08:00:00.000Z',
      null,
      false,
      false,
      true,
      labId,
      ownerId,
    ]);
  });

  it('requests expiry cleanup before reconciling and keeps lifecycle state provider-derived', async () => {
    const { pool, query } = createPool([{
      ...row,
      status: 'stopped',
      expires_at: '2026-09-12T07:59:00.000Z',
    }]);
    const destroyVm = vi.fn().mockResolvedValue(undefined);
    const describeStates = vi.fn().mockResolvedValue(new Map([[externalId, 'destroyed']]));
    const now = vi.fn(() => new Date('2026-09-12T08:00:00.000Z'));

    const result = await reconcileOwnedLabReadModel(pool, `${ownerId.slice(0, -1)}b`, {
      describeStates,
      destroyVm,
      now,
    });

    expect(result).toMatchObject({ cleanupRequested: 1, reconciled: 1, failed: 0 });
    expect(destroyVm).toHaveBeenCalledWith(externalId);
    const update = query.mock.calls.find(([sql]) => String(sql).includes('runtime_observed_at=$2::timestamptz'));
    expect(update?.[1]?.[0]).toBe('destroyed');
  });

  it('coalesces concurrent reconciliation for the same owner in-process', async () => {
    const { pool } = createPool([row]);
    let resolveDescribe!: (states: Map<string, LabInstanceStatus>) => void;
    const describeStates = vi.fn(() => new Promise<Map<string, LabInstanceStatus>>((resolve) => {
      resolveDescribe = resolve;
    }));
    const destroyVm = vi.fn();
    const now = vi.fn(() => new Date('2026-09-12T08:00:00.000Z'));
    const concurrentOwner = `${ownerId.slice(0, -1)}c`;

    const first = reconcileOwnedLabReadModel(pool, concurrentOwner, { describeStates, destroyVm, now });
    const second = reconcileOwnedLabReadModel(pool, concurrentOwner, { describeStates, destroyVm, now });

    expect(second).toBe(first);
    await vi.waitFor(() => expect(describeStates).toHaveBeenCalledTimes(1));
    resolveDescribe(new Map([[externalId, 'running']]));

    await expect(first).resolves.toMatchObject({ reconciled: 1, failed: 0 });
    await expect(second).resolves.toMatchObject({ reconciled: 1, failed: 0 });
    expect(describeStates).toHaveBeenCalledTimes(1);
  });

  it('skips a duplicate provider lookup when another process just observed the same runtime', async () => {
    const { pool } = createPool([{
      ...row,
      runtime_observed_at: '2026-09-12T07:59:59.000Z',
    }]);
    const describeStates = vi.fn();
    const destroyVm = vi.fn();

    const result = await reconcileOwnedLabReadModel(pool, `${ownerId.slice(0, -1)}e`, {
      describeStates,
      destroyVm,
      now: () => new Date('2026-09-12T08:00:00.000Z'),
    });

    expect(result).toMatchObject({
      skipped: true,
      reason: 'recently_reconciled',
      reconciled: 0,
    });
    expect(describeStates).not.toHaveBeenCalled();
  });

  it('uses the database advisory lock to bound cross-process reconciliation', async () => {
    const { pool } = createPool([row], false);
    const describeStates = vi.fn();
    const destroyVm = vi.fn();

    const result = await reconcileOwnedLabReadModel(pool, `${ownerId.slice(0, -1)}d`, {
      describeStates,
      destroyVm,
      now: () => new Date('2026-09-12T08:00:00.000Z'),
    });

    expect(result).toMatchObject({
      skipped: true,
      reason: 'reconciliation_already_running',
      reconciled: 0,
    });
    expect(describeStates).not.toHaveBeenCalled();
    expect(destroyVm).not.toHaveBeenCalled();
  });
});
