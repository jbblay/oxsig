import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getLiveWorkspaceAccess: vi.fn(),
  getPool: vi.fn(),
  publishCollaborationEvent: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/live-workspace/server', () => ({ getLiveWorkspaceAccess: mocks.getLiveWorkspaceAccess }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/realtime/ably', () => ({ publishCollaborationEvent: mocks.publishCollaborationEvent }));

import { POST } from './route';

const workspaceId = '77777777-7777-4777-8777-777777777777';
const bindingId = '88888888-8888-4888-8888-888888888888';
const user = { id: 'learner-1', role: 'user' };
const query = vi.fn();

function request(payload: unknown) {
  return new NextRequest(`http://localhost/api/live-workspaces/${workspaceId}/stage`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });
}
const context = { params: Promise.resolve({ id: workspaceId }) };

describe('Live Workspace presentation stage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req: NextRequest, next: (req: NextRequest, user: typeof user) => Promise<NextResponse>) => next(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue({ query });
    mocks.getLiveWorkspaceAccess.mockResolvedValue({ role: 'owner' });
    mocks.publishCollaborationEvent.mockResolvedValue({ published: true });
    query.mockResolvedValue({ rowCount: 1, rows: [{ id: workspaceId }] });
  });

  it('denies missing CSRF without updating presentation', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    const res = await POST(request({ surface: 'board', bindingId }), context);
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('denies observers and learners even when they belong to the room', async () => {
    mocks.getLiveWorkspaceAccess.mockResolvedValue({ role: 'observer' });
    const res = await POST(request({ surface: 'board', bindingId }), context);
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated workspace membership', async () => {
    mocks.getLiveWorkspaceAccess.mockResolvedValue(null);
    const res = await POST(request({ surface: 'board', bindingId }), context);
    expect(res.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses an unattached resource, preventing cross-workspace presentation', async () => {
    query.mockResolvedValue({ rowCount: 0, rows: [] });
    const res = await POST(request({ surface: 'machine', bindingId }), context);
    expect(res.status).toBe(409);
    expect(mocks.publishCollaborationEvent).not.toHaveBeenCalled();
  });

  it('persists attached Board stage and notifies followers', async () => {
    const res = await POST(request({ surface: 'board', bindingId }), context);
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("r.status = 'attached' AND r.resource_type = $2"),
      [workspaceId, 'storyboard', 'board', bindingId]
    );
    expect(mocks.publishCollaborationEvent).toHaveBeenCalledWith({
      collaborationId: workspaceId,
      name: 'session.changed',
      data: { action: 'live-workspace.stage-changed' },
    });
  });

  it('lets the instructor switch to an attached machine without granting control', async () => {
    mocks.getLiveWorkspaceAccess.mockResolvedValue({ role: 'instructor' });
    const res = await POST(request({ surface: 'machine', bindingId }), context);
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.any(String),
      [workspaceId, 'lab-instance', 'machine', bindingId]
    );
  });

  it('does not allow arbitrary stage modes or resource IDs', async () => {
    for (const payload of [
      { surface: 'screen', bindingId },
      { surface: 'board', bindingId: 'not-a-uuid' },
      { surface: 'board', bindingId, role: 'owner' },
    ]) {
      const res = await POST(request(payload), context);
      expect(res.status).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });
});
