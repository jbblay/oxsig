import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), validateCsrfToken: vi.fn(), checkRateLimit: vi.fn(),
  getPool: vi.fn(), assignLiveWorkspaceRole: vi.fn(), revokeControlForParticipant: vi.fn(),
  revokeControlForBinding: vi.fn(), recordLiveWorkspaceActivity: vi.fn(), publishCollaborationEvent: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/live-workspace/control', () => ({
  revokeControlForParticipant: mocks.revokeControlForParticipant,
  revokeControlForBinding: mocks.revokeControlForBinding,
}));
vi.mock('@/lib/live-workspace/coordination', () => ({ recordLiveWorkspaceActivity: mocks.recordLiveWorkspaceActivity }));
vi.mock('@/lib/live-workspace/server', () => ({
  assignLiveWorkspaceRole: mocks.assignLiveWorkspaceRole,
  LiveWorkspaceError: class LiveWorkspaceError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'LIVE_WORKSPACE_CONFLICT') { super(message); }
  },
}));
vi.mock('@/lib/realtime/ably', () => ({ publishCollaborationEvent: mocks.publishCollaborationEvent }));

import { DELETE, PATCH } from './route';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const targetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ownerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const bindingId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const user = { id: ownerId, clerkUserId: 'clerk-1', role: 'user' as const };

function request(body: unknown, method: 'PATCH' | 'DELETE' = 'PATCH') {
  return new NextRequest(`http://localhost/api/live-workspaces/${workspaceId}/participants/${targetId}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Live Workspace participant role API', () => {
  const poolQuery = vi.fn();
  const clientQuery = vi.fn();
  const release = vi.fn();
  const pool = { query: poolQuery, connect: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    pool.connect.mockResolvedValue({ query: clientQuery, release });
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue(pool);
    mocks.assignLiveWorkspaceRole.mockResolvedValue({
      role: 'learner',
      capabilities: { observe: true, collaborate: true, requestControl: true, grantControl: false, manageParticipants: false, manageResources: false, eligibleForTerminalControl: true, eligibleForDesktopControl: true },
    });
    mocks.revokeControlForParticipant.mockResolvedValue(undefined);
    mocks.revokeControlForBinding.mockResolvedValue(undefined);
    mocks.recordLiveWorkspaceActivity.mockResolvedValue(undefined);
    mocks.publishCollaborationEvent.mockResolvedValue({ configured: true, published: true });
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT c.owner_id')) return { rows: [{ owner_id: ownerId }], rowCount: 1 };
      if (sql.includes('FROM collaboration_members')) return { rows: [{ exists: 1 }], rowCount: 1 };
      if (sql.includes('UPDATE live_workspace_resources')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    });
  });

  it('accepts only the strict Live Workspace role set and never accepts owner from the browser', async () => {
    const response = await PATCH(request({ role: 'owner' }), { params: Promise.resolve({ id: workspaceId, userId: targetId }) });
    expect(response.status).toBe(400);
    expect(mocks.assignLiveWorkspaceRole).not.toHaveBeenCalled();
    expect(mocks.publishCollaborationEvent).not.toHaveBeenCalled();
  });

  it('delegates authorization to the server role policy with the authenticated actor', async () => {
    const response = await PATCH(request({ role: 'learner' }), { params: Promise.resolve({ id: workspaceId, userId: targetId }) });
    expect(response.status).toBe(200);
    expect(mocks.assignLiveWorkspaceRole).toHaveBeenCalledWith({
      pool, collaborationId: workspaceId, actorId: user.id, targetUserId: targetId, role: 'learner',
    });
    expect(mocks.revokeControlForParticipant).not.toHaveBeenCalled();
    expect(mocks.publishCollaborationEvent).toHaveBeenCalledWith({
      collaborationId: workspaceId,
      name: 'members.changed',
      data: { memberId: targetId, action: 'live-workspace.role-changed', role: 'learner' },
    });
  });

  it('revokes control and detaches contributions when a participant becomes observer', async () => {
    mocks.assignLiveWorkspaceRole.mockResolvedValue({ role: 'observer', capabilities: {} });
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE live_workspace_resources')) return { rows: [{ id: bindingId }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const response = await PATCH(request({ role: 'observer' }), { params: Promise.resolve({ id: workspaceId, userId: targetId }) });
    expect(response.status).toBe(200);
    expect(mocks.revokeControlForBinding).toHaveBeenCalledWith(expect.objectContaining({
      collaborationId: workspaceId,
      bindingId,
      actorId: user.id,
      reason: 'role_became_observer',
    }));
    expect(mocks.revokeControlForParticipant).toHaveBeenCalledWith(expect.objectContaining({
      collaborationId: workspaceId,
      participantId: targetId,
      actorId: user.id,
      reason: 'role_became_observer',
    }));
    expect(await response.json()).toMatchObject({ detachedResources: 1 });
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('lets the owner remove a participant and revokes machine control first', async () => {
    const response = await DELETE(request(undefined, 'DELETE'), { params: Promise.resolve({ id: workspaceId, userId: targetId }) });
    expect(response.status).toBe(200);
    expect(mocks.revokeControlForParticipant).toHaveBeenCalledWith(expect.objectContaining({
      collaborationId: workspaceId,
      participantId: targetId,
      actorId: ownerId,
      reason: 'participant_removed',
    }));
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'removed'"), [workspaceId, targetId]);
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(mocks.publishCollaborationEvent).toHaveBeenCalledWith({
      collaborationId: workspaceId,
      name: 'members.changed',
      data: { memberId: targetId, action: 'removed' },
    });
  });

  it('detaches participant-owned resources and revokes binding control before removal commits', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT c.owner_id')) return { rows: [{ owner_id: ownerId }], rowCount: 1 };
      if (sql.includes('FROM collaboration_members')) return { rows: [{ exists: 1 }], rowCount: 1 };
      if (sql.includes('UPDATE live_workspace_resources')) return { rows: [{ id: bindingId }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const response = await DELETE(request(undefined, 'DELETE'), { params: Promise.resolve({ id: workspaceId, userId: targetId }) });
    expect(response.status).toBe(200);
    expect(mocks.revokeControlForBinding).toHaveBeenCalledWith({
      queryable: expect.anything(),
      collaborationId: workspaceId,
      bindingId,
      actorId: ownerId,
      reason: 'participant_removed',
    });
    expect(await response.json()).toMatchObject({ detachedResources: 1 });
  });

  it('never allows the workspace owner to be removed', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT c.owner_id')) return { rows: [{ owner_id: targetId }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const response = await DELETE(request(undefined, 'DELETE'), { params: Promise.resolve({ id: workspaceId, userId: targetId }) });
    expect(response.status).toBe(409);
    expect(mocks.revokeControlForParticipant).not.toHaveBeenCalled();
    expect(mocks.revokeControlForBinding).not.toHaveBeenCalled();
    expect(mocks.publishCollaborationEvent).not.toHaveBeenCalled();
  });
});
