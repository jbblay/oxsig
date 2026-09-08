import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
  getCollaborationAccess: vi.fn(),
  publishCollaborationEvent: vi.fn(),
  revokeControlForParticipant: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/collab/server', () => ({ getCollaborationAccess: mocks.getCollaborationAccess }));
vi.mock('@/lib/realtime/ably', () => ({ publishCollaborationEvent: mocks.publishCollaborationEvent }));
vi.mock('@/lib/live-workspace/control', () => ({ revokeControlForParticipant: mocks.revokeControlForParticipant }));

import { DELETE } from './route';

const collaborationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const targetId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const user = { id: ownerId, role: 'user' as const };

function request() {
  return new NextRequest(`http://localhost/api/collaborations/${collaborationId}/members/${targetId}`, { method: 'DELETE' });
}

describe('collaboration member removal', () => {
  const clientQuery = vi.fn();
  const release = vi.fn();
  const pool = { query: vi.fn(), connect: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    pool.connect.mockResolvedValue({ query: clientQuery, release });
    mocks.getPool.mockReturnValue(pool);
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getCollaborationAccess.mockResolvedValue({
      id: collaborationId,
      name: 'Session',
      ownerId,
      isOwner: true,
      role: 'owner',
    });
    mocks.publishCollaborationEvent.mockResolvedValue(undefined);
    mocks.revokeControlForParticipant.mockResolvedValue(undefined);
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE collaboration_members')) return { rows: [{ user_id: targetId }], rowCount: 1 };
      if (sql.includes('SELECT 1 FROM live_workspaces')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    });
  });

  it('lets the owner remove another member', async () => {
    const response = await DELETE(request(), { params: Promise.resolve({ id: collaborationId, userId: targetId }) });
    expect(response.status).toBe(200);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'removed'"), [collaborationId, targetId]);
    expect(await response.json()).toEqual({ removed: true, left: false });
  });

  it('does not let anyone remove the collaboration owner', async () => {
    mocks.getCollaborationAccess.mockResolvedValue({
      id: collaborationId,
      name: 'Session',
      ownerId: targetId,
      isOwner: false,
      role: 'member',
    });
    const response = await DELETE(request(), { params: Promise.resolve({ id: collaborationId, userId: targetId }) });
    expect(response.status).toBe(409);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('revokes Live Workspace control when the collaboration is a live workspace', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE collaboration_members')) return { rows: [{ user_id: targetId }], rowCount: 1 };
      if (sql.includes('SELECT 1 FROM live_workspaces')) return { rows: [{ exists: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const response = await DELETE(request(), { params: Promise.resolve({ id: collaborationId, userId: targetId }) });
    expect(response.status).toBe(200);
    expect(mocks.revokeControlForParticipant).toHaveBeenCalledWith(expect.objectContaining({
      collaborationId,
      participantId: targetId,
      actorId: ownerId,
      reason: 'participant_removed',
    }));
  });
});
