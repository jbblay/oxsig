import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
  getLiveWorkspaceAccess: vi.fn(),
  assertOwnerResource: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/live-workspace/server', () => ({
  getLiveWorkspaceAccess: mocks.getLiveWorkspaceAccess,
  assertOwnerResource: mocks.assertOwnerResource,
  LiveWorkspaceError: class LiveWorkspaceError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'LIVE_WORKSPACE_CONFLICT') { super(message); }
  },
}));

import { POST } from './route';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const labId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ownerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const user = { id: ownerId, clerkUserId: 'clerk-owner', role: 'user' as const };

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/live-workspaces/${workspaceId}/resources`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function access(overrides: Record<string, unknown> = {}) {
  return {
    id: workspaceId,
    name: 'Class lab',
    description: '',
    ownerId,
    role: 'owner',
    isOwner: true,
    capabilities: {
      observe: true, collaborate: true, requestControl: true, grantControl: true,
      manageParticipants: true, manageResources: true,
      eligibleForTerminalControl: true, eligibleForDesktopControl: true,
    },
    ...overrides,
  };
}

describe('Live Workspace resource binding API', () => {
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue({ query });
    mocks.getLiveWorkspaceAccess.mockResolvedValue(access());
    mocks.assertOwnerResource.mockResolvedValue({ id: labId, label: 'Ubuntu Lab' });
    query.mockResolvedValue({ rows: [{
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      resource_type: 'lab-instance', resource_id: labId, resource_owner_id: ownerId,
      attached_by: ownerId, metadata: { label: 'Ubuntu Lab' }, attached_at: new Date().toISOString(),
    }], rowCount: 1 });
  });

  it('rejects resource attachment when the participant lacks owner resource management', async () => {
    mocks.getLiveWorkspaceAccess.mockResolvedValue(access({
      role: 'instructor', isOwner: false,
      capabilities: { ...access().capabilities, manageResources: false },
    }));

    const response = await POST(request({ resourceType: 'lab-instance', resourceId: labId }), { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(403);
    expect(mocks.assertOwnerResource).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('validates exact workspace-owner resource ownership before binding', async () => {
    const response = await POST(request({ resourceType: 'lab-instance', resourceId: labId }), { params: Promise.resolve({ id: workspaceId }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.assertOwnerResource).toHaveBeenCalledWith(expect.anything(), ownerId, 'lab-instance', labId);
    expect(body.resource).toMatchObject({
      resourceId: labId,
      resourceOwnerId: ownerId,
      ownershipTransferred: false,
    });
  });

  it('does not accept arbitrary resource types', async () => {
    const response = await POST(request({ resourceType: 'shell-session', resourceId: labId }), { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(400);
    expect(mocks.getLiveWorkspaceAccess).not.toHaveBeenCalled();
  });
});
