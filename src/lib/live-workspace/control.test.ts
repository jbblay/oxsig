import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { approveControlRequest, createControlRequest, getActiveControlLease } from './control';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const requestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ownerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const bindingId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function ownerAccessRow() {
  return { owner_id: ownerId, is_owner: true, live_role: 'owner' };
}

describe('Live Workspace control lease policy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects self-approval before any lease is inserted', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('FROM live_workspace_control_requests')) {
        return { rows: [{
          id: requestId,
          participant_id: ownerId,
          resource_binding_id: bindingId,
          lab_instance_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          surface: 'terminal',
          status: 'pending',
        }], rowCount: 1 };
      }
      if (sql.includes('FROM collaborations c')) return { rows: [ownerAccessRow()], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const release = vi.fn();
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) } as any;

    await expect(approveControlRequest({
      pool,
      collaborationId: workspaceId,
      requestId,
      grantorId: ownerId,
      durationMinutes: 15,
    })).rejects.toMatchObject({ code: 'CONTROL_SELF_GRANT_DENIED', status: 403 });

    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO live_workspace_control_leases'))).toBe(false);
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('rejects invalid durations before opening a database transaction', async () => {
    const pool = { connect: vi.fn() } as any;
    await expect(approveControlRequest({
      pool,
      collaborationId: workspaceId,
      requestId,
      grantorId: ownerId,
      durationMinutes: 120,
    })).rejects.toMatchObject({ code: 'CONTROL_LEASE_DURATION_INVALID', status: 400 });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('does not let a generic observer request control', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM collaborations c')) {
        return { rows: [{ owner_id: ownerId, is_owner: false, live_role: 'observer' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const pool = { query } as any;

    await expect(createControlRequest({
      pool,
      collaborationId: workspaceId,
      participantId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      bindingId,
      surface: 'terminal',
    })).rejects.toMatchObject({ code: 'CONTROL_REQUEST_DENIED', status: 403 });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns no authority when the server-side active-lease lookup has no matching row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(getActiveControlLease({
      queryable: { query } as any,
      collaborationId: workspaceId,
      participantId: ownerId,
      bindingId,
      surface: 'terminal',
    })).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
