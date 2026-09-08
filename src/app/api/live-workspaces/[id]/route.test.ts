import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  deleteCollaborationObjects: vi.fn(),
  getLiveWorkspaceAccess: vi.fn(),
  listLiveWorkspaceParticipants: vi.fn(),
  listOwnerAttachableResources: vi.fn(),
  listControlState: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/collab/storage', () => ({ deleteCollaborationObjects: mocks.deleteCollaborationObjects }));
vi.mock('@/lib/live-workspace/control', () => ({ listControlState: mocks.listControlState }));
vi.mock('@/lib/live-workspace/server', () => ({
  getLiveWorkspaceAccess: mocks.getLiveWorkspaceAccess,
  listLiveWorkspaceParticipants: mocks.listLiveWorkspaceParticipants,
  listOwnerAttachableResources: mocks.listOwnerAttachableResources,
}));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));

import { DELETE, PATCH } from './route';

const user = { id: 'user-1', role: 'user' as const };
const workspaceId = '33333333-3333-4333-8333-333333333333';
const owned = {
  id: workspaceId,
  name: 'Workspace',
  description: 'Shared lab',
  owner_id: user.id,
  collaboration_status: 'active',
  workspace_status: 'active',
};
const updated = {
  id: workspaceId,
  name: 'Workspace',
  description: 'Shared lab',
  owner_id: user.id,
  status: 'ended',
  created_at: new Date('2026-09-08T00:00:00.000Z'),
  updated_at: new Date('2026-09-08T01:00:00.000Z'),
};

function input(method: 'PATCH' | 'DELETE', body?: unknown, id = workspaceId) {
  return {
    request: new NextRequest(`http://localhost/api/live-workspaces/${id}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
    context: { params: Promise.resolve({ id }) },
  };
}

describe('/api/live-workspaces/[id] lifecycle', () => {
  const poolQuery = vi.fn();
  const clientQuery = vi.fn();
  const release = vi.fn();
  const pool = { query: poolQuery, connect: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    pool.connect.mockResolvedValue({ query: clientQuery, release });
    mocks.getPool.mockReturnValue(pool);
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, user: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.deleteCollaborationObjects.mockResolvedValue(0);
    poolQuery.mockResolvedValue({ rows: [{ id: workspaceId }], rowCount: 1 });
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT c.id') && sql.includes('FOR UPDATE')) return { rows: [owned], rowCount: 1 };
      if (sql.includes('UPDATE collaborations')) return { rows: [updated], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
  });

  it('requires CSRF before owner lifecycle changes', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    const args = input('PATCH', { action: 'end' });
    const response = await PATCH(args.request, args.context);
    expect(response.status).toBe(403);
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('ends a workspace and revokes machine-control state atomically', async () => {
    const args = input('PATCH', { action: 'end' });
    const response = await PATCH(args.request, args.context);
    expect(response.status).toBe(200);
    expect(clientQuery).toHaveBeenCalledWith('BEGIN');
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'cancelled'"), [workspaceId, user.id]);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'revoked'"), [workspaceId, user.id]);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'ended'"), [workspaceId]);
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('allows the owner to rename workspace metadata', async () => {
    const args = input('PATCH', { name: 'Renamed workspace' });
    const response = await PATCH(args.request, args.context);
    expect(response.status).toBe(200);
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE collaborations'),
      [workspaceId, user.id, 'Renamed workspace', false, null, 'active']
    );
  });

  it('cleans attachment objects before permanently deleting an owned workspace', async () => {
    const args = input('DELETE');
    const response = await DELETE(args.request, args.context);
    expect(response.status).toBe(200);
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining("collaboration_type = 'live-workspace'"), [workspaceId, user.id]);
    expect(mocks.deleteCollaborationObjects).toHaveBeenCalledWith(workspaceId);
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM collaborations'), [workspaceId, user.id]);
    expect(await response.json()).toEqual({ deleted: true });
  });

  it('returns not found for non-owned workspace deletion', async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const args = input('DELETE');
    const response = await DELETE(args.request, args.context);
    expect(response.status).toBe(404);
    expect(mocks.deleteCollaborationObjects).not.toHaveBeenCalled();
  });

  it('does not delete relational data if attachment cleanup fails', async () => {
    mocks.deleteCollaborationObjects.mockRejectedValue(new Error('storage unavailable'));
    const args = input('DELETE');
    const response = await DELETE(args.request, args.context);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Could not delete Live Workspace attachments. Nothing was deleted.' });
    expect(poolQuery).toHaveBeenCalledTimes(1);
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT id'), [workspaceId, user.id]);
  });
});
