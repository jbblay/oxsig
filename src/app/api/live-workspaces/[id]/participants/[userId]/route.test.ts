import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), validateCsrfToken: vi.fn(), checkRateLimit: vi.fn(),
  getPool: vi.fn(), assignLiveWorkspaceRole: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/live-workspace/server', () => ({
  assignLiveWorkspaceRole: mocks.assignLiveWorkspaceRole,
  LiveWorkspaceError: class LiveWorkspaceError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'LIVE_WORKSPACE_CONFLICT') { super(message); }
  },
}));

import { PATCH } from './route';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const targetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', clerkUserId: 'clerk-1', role: 'user' as const };

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/live-workspaces/${workspaceId}/participants/${targetId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('Live Workspace participant role API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue({ query: vi.fn() });
    mocks.assignLiveWorkspaceRole.mockResolvedValue({
      role: 'learner',
      capabilities: { observe: true, collaborate: true, requestControl: true, grantControl: false, manageParticipants: false, manageResources: false, eligibleForTerminalControl: true, eligibleForDesktopControl: true },
    });
  });

  it('accepts only the strict Live Workspace role set and never accepts owner from the browser', async () => {
    const response = await PATCH(request({ role: 'owner' }), { params: Promise.resolve({ id: workspaceId, userId: targetId }) });
    expect(response.status).toBe(400);
    expect(mocks.assignLiveWorkspaceRole).not.toHaveBeenCalled();
  });

  it('delegates authorization to the server role policy with the authenticated actor', async () => {
    const response = await PATCH(request({ role: 'learner' }), { params: Promise.resolve({ id: workspaceId, userId: targetId }) });
    expect(response.status).toBe(200);
    expect(mocks.assignLiveWorkspaceRole).toHaveBeenCalledWith({
      pool: expect.anything(), collaborationId: workspaceId, actorId: user.id, targetUserId: targetId, role: 'learner',
    });
  });
});
