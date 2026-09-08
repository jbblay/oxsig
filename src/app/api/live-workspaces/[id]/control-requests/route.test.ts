import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), validateCsrfToken: vi.fn(), checkRateLimit: vi.fn(), getPool: vi.fn(),
  createControlRequest: vi.fn(), listControlState: vi.fn(), createWorkspaceNotification: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/notifications/server', () => ({ createWorkspaceNotification: mocks.createWorkspaceNotification }));
vi.mock('@/lib/live-workspace/control', () => ({
  createControlRequest: mocks.createControlRequest,
  listControlState: mocks.listControlState,
}));
vi.mock('@/lib/live-workspace/server', () => ({
  LiveWorkspaceError: class LiveWorkspaceError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'LIVE_WORKSPACE_CONFLICT') { super(message); }
  },
}));

import { GET, POST } from './route';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bindingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', clerkUserId: 'clerk-1', role: 'user' as const };
const pool = { query: vi.fn() };

function request(method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/live-workspaces/${workspaceId}/control-requests`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('Live Workspace control request API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue(pool);
    mocks.createControlRequest.mockResolvedValue({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', status: 'pending' });
    mocks.listControlState.mockResolvedValue({ requests: [], leases: [] });
    mocks.createWorkspaceNotification.mockResolvedValue(null);
    pool.query.mockResolvedValue({ rows: [] });
  });

  it('binds a request to the authenticated participant rather than browser identity', async () => {
    const response = await POST(request('POST', { bindingId, surface: 'terminal' }), { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(201);
    expect(mocks.createControlRequest).toHaveBeenCalledWith({
      pool,
      collaborationId: workspaceId,
      participantId: user.id,
      bindingId,
      surface: 'terminal',
    });
  });

  it('notifies the workspace owner when another participant requests control', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{
      owner_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      workspace_name: 'Incident room',
      participant_name: 'Learner',
    }] });

    const response = await POST(request('POST', { bindingId, surface: 'desktop' }), { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(201);
    expect(mocks.createWorkspaceNotification).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      type: 'live.control_request',
      href: '/live',
      sourceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    }));
  });

  it('rejects browser attempts to supply extra authorization identity fields', async () => {
    const response = await POST(request('POST', { bindingId, surface: 'terminal', participantId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }), { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(400);
    expect(mocks.createControlRequest).not.toHaveBeenCalled();
  });

  it('lists control state using the authenticated viewer', async () => {
    const response = await GET(request('GET'), { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(200);
    expect(mocks.listControlState).toHaveBeenCalledWith({ pool, collaborationId: workspaceId, viewerId: user.id });
  });
});
