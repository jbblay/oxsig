import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), validateCsrfToken: vi.fn(), checkRateLimit: vi.fn(), getPool: vi.fn(), approveControlRequest: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/live-workspace/control', () => ({
  approveControlRequest: mocks.approveControlRequest,
  CONTROL_LEASE_MINUTES: { min: 5, max: 60, default: 15 },
}));
vi.mock('@/lib/live-workspace/server', () => ({
  LiveWorkspaceError: class LiveWorkspaceError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'LIVE_WORKSPACE_CONFLICT') { super(message); }
  },
}));

import { POST } from './route';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const requestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', clerkUserId: 'clerk-1', role: 'user' as const };
const pool = { connect: vi.fn() };

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/live-workspaces/${workspaceId}/control-requests/${requestId}/approve`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('Live Workspace control approval API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue(pool);
    mocks.approveControlRequest.mockResolvedValue({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', status: 'active' });
  });

  it('derives the grantor from authentication and defaults leases to 15 minutes', async () => {
    const response = await POST(request({}), { params: Promise.resolve({ id: workspaceId, requestId }) });
    expect(response.status).toBe(201);
    expect(mocks.approveControlRequest).toHaveBeenCalledWith({
      pool,
      collaborationId: workspaceId,
      requestId,
      grantorId: user.id,
      durationMinutes: 15,
    });
  });

  it('rejects lease durations outside the bounded policy before authorization runs', async () => {
    const response = await POST(request({ durationMinutes: 120 }), { params: Promise.resolve({ id: workspaceId, requestId }) });
    expect(response.status).toBe(400);
    expect(mocks.approveControlRequest).not.toHaveBeenCalled();
  });
});
