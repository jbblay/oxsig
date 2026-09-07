import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
  getLiveWorkspaceAccess: vi.fn(),
  assertOwnerResource: vi.fn(),
  revokeControlForBinding: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/live-workspace/control', () => ({ revokeControlForBinding: mocks.revokeControlForBinding }));
vi.mock('@/lib/live-workspace/server', () => ({
  getLiveWorkspaceAccess: mocks.getLiveWorkspaceAccess,
  assertOwnerResource: mocks.assertOwnerResource,
  LiveWorkspaceError: class LiveWorkspaceError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'LIVE_WORKSPACE_CONFLICT') { super(message); }
  },
}));

import { DELETE, POST } from './route';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const labId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ownerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const bindingId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const boardId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const vaultId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const user = { id: ownerId, clerkUserId: 'clerk-owner', role: 'user' as const };

function request(body: unknown, method = 'POST') {
  return new NextRequest(`http://localhost/api/live-workspaces/${workspaceId}/resources`, {
    method,
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
  const clientQuery = vi.fn();
  const release = vi.fn();
  const pool = { query, connect: vi.fn().mockResolvedValue({ query: clientQuery, release }) };

  beforeEach(() => {
    vi.clearAllMocks();
    pool.connect.mockResolvedValue({ query: clientQuery, release });
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue(pool);
    mocks.getLiveWorkspaceAccess.mockResolvedValue(access());
    mocks.assertOwnerResource.mockResolvedValue({ id: labId, label: 'Ubuntu Lab' });
    mocks.revokeControlForBinding.mockResolvedValue(undefined);
    query.mockResolvedValue({ rows: [{
      id: bindingId,
      resource_type: 'lab-instance', resource_id: labId, resource_owner_id: ownerId,
      attached_by: ownerId, metadata: { label: 'Ubuntu Lab' }, attached_at: new Date().toISOString(),
    }], rowCount: 1 });
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE live_workspace_resources')) return { rows: [{ id: bindingId }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
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

  it.each([
    ['storyboard', boardId, 'Process model'],
    ['vault-item', vaultId, 'fork notes'],
  ] as const)('accepts owner-scoped %s resources without transferring ownership', async (resourceType, resourceId, label) => {
    mocks.assertOwnerResource.mockResolvedValue({ id: resourceId, label });
    query.mockResolvedValueOnce({ rows: [{
      id: bindingId,
      resource_type: resourceType,
      resource_id: resourceId,
      resource_owner_id: ownerId,
      attached_by: ownerId,
      metadata: { label },
      attached_at: new Date().toISOString(),
    }], rowCount: 1 });

    const response = await POST(request({ resourceType, resourceId }), { params: Promise.resolve({ id: workspaceId }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.assertOwnerResource).toHaveBeenCalledWith(expect.anything(), ownerId, resourceType, resourceId);
    expect(body.resource).toMatchObject({ resourceId, resourceOwnerId: ownerId, ownershipTransferred: false });
  });

  it('does not accept arbitrary resource types', async () => {
    const response = await POST(request({ resourceType: 'shell-session', resourceId: labId }), { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(400);
    expect(mocks.getLiveWorkspaceAccess).not.toHaveBeenCalled();
  });

  it('revokes active leases and cancels pending requests when a binding detaches', async () => {
    const response = await DELETE(request({ bindingId }, 'DELETE'), { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(200);
    expect(mocks.revokeControlForBinding).toHaveBeenCalledWith({
      queryable: expect.objectContaining({ query: clientQuery }),
      collaborationId: workspaceId,
      bindingId,
      actorId: ownerId,
      reason: 'resource_detached',
    });
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalled();
  });
});
