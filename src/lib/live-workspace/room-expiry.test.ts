import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getCollaborationAccess } from '@/lib/collab/server';
import { assertTerminalWorkspaceControl } from '../labs/terminal-workspace-control.js';
import { getActiveControlLease } from './control';
import { getLiveWorkspaceAccess } from './server';

/*
 * Rescue Rooms are Live Workspaces with live_workspaces.expires_at set. Every
 * authorization path must refuse once that instant passes, without relying on
 * a background job. NULL keeps existing rooms open-ended.
 */

function capture() {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] as unknown[], rowCount: 0 }));
  return { query, sql: () => String(query.mock.calls[0]?.[0] ?? '') };
}

const ids = {
  collaborationId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  bindingId: '33333333-3333-4333-8333-333333333333',
  leaseId: '44444444-4444-4444-8444-444444444444',
  labInstanceId: '55555555-5555-4555-8555-555555555555',
};

describe('time-limited Live Workspace enforcement', () => {
  it('room access refuses after expiry', async () => {
    const pool = capture();
    await expect(getLiveWorkspaceAccess(pool as never, ids.collaborationId, ids.userId)).resolves.toBeNull();
    expect(pool.sql()).toContain('(lw.expires_at IS NULL OR lw.expires_at > NOW())');
  });

  it('control leases stop authorizing after expiry', async () => {
    const pool = capture();
    await getActiveControlLease({ queryable: pool as never, collaborationId: ids.collaborationId, participantId: ids.userId, bindingId: ids.bindingId, surface: 'terminal' });
    expect(pool.sql()).toContain('(workspace.expires_at IS NULL OR workspace.expires_at > NOW())');
  });

  it('the terminal bridge drops shared input after expiry', async () => {
    const pool = capture();
    await expect(
      assertTerminalWorkspaceControl(pool, { surface: 'terminal', collaborationId: ids.collaborationId, participantId: ids.userId, bindingId: ids.bindingId, leaseId: ids.leaseId, labInstanceId: ids.labInstanceId })
    ).rejects.toThrow(/no longer active/);
    expect(pool.sql()).toContain('(workspace.expires_at IS NULL OR workspace.expires_at > NOW())');
  });

  it('room members lose chat and collaboration access after expiry, owners keep their history', async () => {
    const pool = capture();
    await getCollaborationAccess(pool as never, ids.collaborationId, ids.userId);
    expect(pool.sql()).toContain('LEFT JOIN live_workspaces lw');
    expect(pool.sql()).toContain('(c.owner_id = $1 OR lw.expires_at IS NULL OR lw.expires_at > NOW())');
  });
});
