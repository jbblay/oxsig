import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
  getOperation: vi.fn(),
  getOperationRun: vi.fn(),
  stringifyPostgresJson: vi.fn((value: unknown) => JSON.stringify(value)),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/db/postgres-safe', () => ({ stringifyPostgresJson: mocks.stringifyPostgresJson }));
vi.mock('@/lib/operations/catalog', () => ({ getOperation: mocks.getOperation }));
vi.mock('@/lib/operations/run-view', () => ({ getLearnerOperationRun: mocks.getOperationRun }));

import { GET, POST } from './route';

const user = { id: 'user-1', role: 'user' as const };
const ownerId = 'user-1';
const runId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const labId = '33333333-3333-4333-8333-333333333333';
const runRow = {
  id: runId,
  operation_slug: 'black-domain',
  mode: 'warroom',
  status: 'provisioning',
  expires_at: new Date(Date.now() + 60_000),
  operator_lab_instance_id: labId,
};
const publicRun = {
  id: runId,
  operationSlug: 'black-domain',
  mode: 'warroom',
  status: 'provisioning',
  nodes: [],
};

function request(method: 'GET' | 'POST', body?: unknown) {
  return {
    request: new NextRequest(`http://localhost/api/warroom/runs/${runId}/workspace`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    }),
    context: { params: Promise.resolve({ id: runId }) },
  };
}

describe('/api/warroom/runs/[id]/workspace', () => {
  const poolQuery = vi.fn();
  const clientQuery = vi.fn();
  const release = vi.fn();
  const connect = vi.fn();
  const pool = { query: poolQuery, connect };

  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue({ query: clientQuery, release });
    mocks.getPool.mockReturnValue(pool);
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, user: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getOperation.mockReturnValue({ codename: 'Operation Black Domain', name: 'Active Directory Pentest' });
    mocks.getOperationRun.mockResolvedValue(publicRun);
  });

  it('requires CSRF before creating or linking a team workspace', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    const args = request('POST');
    const response = await POST(args.request, args.context);
    expect(response.status).toBe(403);
    expect(connect).not.toHaveBeenCalled();
  });

  it('returns the durable linked workspace to an authorized participant', async () => {
    poolQuery.mockResolvedValue({
      rows: [{ owner_id: ownerId, operation_slug: 'black-domain', mode: 'warroom', status: 'running', workspace_id: workspaceId }],
      rowCount: 1,
    });
    const args = request('GET');
    const response = await GET(args.request, args.context);
    expect(response.status).toBe(200);
    expect(mocks.getOperationRun).toHaveBeenCalledWith({ pool, runId, ownerId });
    expect(await response.json()).toEqual({ workspaceId, canCreateWorkspace: false, run: publicRun });
  });

  it('reuses an existing linked workspace and reattaches the Operation operator lab idempotently', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM operation_runs') && sql.includes('FOR UPDATE')) return { rows: [runRow], rowCount: 1 };
      if (sql.includes('FROM collaborations c') && sql.includes("c.settings->'operation'")) return { rows: [{ id: workspaceId }], rowCount: 1 };
      if (sql.includes('FROM lab_instances li')) return { rows: [{ id: labId, label: 'Ubuntu operator' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const args = request('POST');
    const response = await POST(args.request, args.context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ workspaceId, created: false });
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO live_workspace_resources'), expect.arrayContaining([workspaceId, labId, user.id]));
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO collaborations'))).toBe(false);
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('reuses an explicitly handed-off Live Workspace instead of creating a parallel team workspace', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM operation_runs') && sql.includes('FOR UPDATE')) return { rows: [runRow], rowCount: 1 };
      if (sql.includes('WHERE c.id = $1') && sql.includes("c.collaboration_type = 'live-workspace'")) {
        return { rows: [{ id: workspaceId, settings: { liveWorkspaceVersion: 1 } }], rowCount: 1 };
      }
      if (sql.includes('FROM lab_instances li')) return { rows: [{ id: labId, label: 'Ubuntu operator' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const args = request('POST', { sourceWorkspaceId: workspaceId });
    const response = await POST(args.request, args.context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ workspaceId, created: false, reusedSource: true });

    const linkCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes("settings = COALESCE(settings"));
    expect(linkCall).toBeTruthy();
    expect(String(linkCall?.[1]?.[2])).toContain(`\"runId\":\"${runId}\"`);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO live_workspace_resources'), expect.arrayContaining([workspaceId, labId, user.id]));
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO collaborations'))).toBe(false);
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('rejects handing off a workspace that is already linked to another operation', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM operation_runs') && sql.includes('FOR UPDATE')) return { rows: [runRow], rowCount: 1 };
      if (sql.includes('WHERE c.id = $1') && sql.includes("c.collaboration_type = 'live-workspace'")) {
        return { rows: [{ id: workspaceId, settings: { operation: { runId: '99999999-9999-4999-8999-999999999999' } } }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const args = request('POST', { sourceWorkspaceId: workspaceId });
    const response = await POST(args.request, args.context);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/already linked/i);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO live_workspace_resources'))).toBe(false);
  });

  it('creates one linked Live Workspace with Operation provenance and attaches the operator lab', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM operation_runs') && sql.includes('FOR UPDATE')) return { rows: [runRow], rowCount: 1 };
      if (sql.includes('FROM collaborations c') && sql.includes("c.settings->'operation'")) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO collaborations')) return { rows: [{ id: workspaceId }], rowCount: 1 };
      if (sql.includes('FROM lab_instances li')) return { rows: [{ id: labId, label: 'Ubuntu operator' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const args = request('POST');
    const response = await POST(args.request, args.context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ workspaceId, created: true });

    const createCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO collaborations'));
    expect(createCall).toBeTruthy();
    expect(String(createCall?.[1]?.[3])).toContain(`\"runId\":\"${runId}\"`);
    expect(String(createCall?.[1]?.[3])).toContain('\"warRoomVersion\":1');
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO live_workspace_resources'), expect.arrayContaining([workspaceId, labId, user.id]));
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
  });
});
