import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
  getOperationRun: vi.fn(),
  destroyOperationRun: vi.fn(),
  pauseOperationRun: vi.fn(),
  resumeOperationRun: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/operations/lifecycle', () => ({
  pauseOperationRun: mocks.pauseOperationRun,
  resumeOperationRun: mocks.resumeOperationRun,
  OperationLifecycleError: class OperationLifecycleError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'OPERATION_LIFECYCLE_CONFLICT') { super(message); }
  },
}));
vi.mock('@/lib/operations/runtime', () => ({
  getOperationRun: mocks.getOperationRun,
  destroyOperationRun: mocks.destroyOperationRun,
  OperationRuntimeError: class OperationRuntimeError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'OPERATION_RUNTIME_CONFLICT') { super(message); }
  },
}));
vi.mock('@/lib/audit/logger', () => ({
  AUDIT_ACTIONS: { LAB_START: 'lab.start', LAB_STOP: 'lab.stop' },
  getRequestMetadata: vi.fn(() => ({})),
  logAudit: mocks.logAudit,
}));

import { DELETE, GET, PATCH } from './route';

const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', clerkUserId: 'clerk-user', role: 'user' as const };

function request(method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost/api/operations/runs/${runId}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

describe('Operation run API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue({});
    mocks.getOperationRun.mockResolvedValue({ id: runId, status: 'running', nodes: [] });
    mocks.destroyOperationRun.mockResolvedValue({ destroyed: true, alreadyDestroyed: false, terminating: 3 });
    mocks.pauseOperationRun.mockResolvedValue({ paused: true, stopping: 3 });
    mocks.resumeOperationRun.mockResolvedValue({ resumed: true, starting: 3 });
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it('returns only the authenticated owner run', async () => {
    const response = await GET(request(), { params: Promise.resolve({ id: runId }) });
    expect(response.status).toBe(200);
    expect(mocks.getOperationRun).toHaveBeenCalledWith({ pool: expect.anything(), runId, ownerId: user.id });
  });

  it('pauses the whole run behind CSRF protection', async () => {
    const response = await PATCH(request('PATCH', { action: 'pause' }), { params: Promise.resolve({ id: runId }) });
    expect(response.status).toBe(200);
    expect(mocks.pauseOperationRun).toHaveBeenCalledWith({ pool: expect.anything(), runId, ownerId: user.id });
    expect(mocks.resumeOperationRun).not.toHaveBeenCalled();
  });

  it('resumes the whole run behind CSRF protection', async () => {
    const response = await PATCH(request('PATCH', { action: 'resume' }), { params: Promise.resolve({ id: runId }) });
    expect(response.status).toBe(200);
    expect(mocks.resumeOperationRun).toHaveBeenCalledWith({ pool: expect.anything(), runId, ownerId: user.id });
  });

  it('rejects lifecycle changes without CSRF', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    const response = await PATCH(request('PATCH', { action: 'pause' }), { params: Promise.resolve({ id: runId }) });
    expect(response.status).toBe(403);
    expect(mocks.pauseOperationRun).not.toHaveBeenCalled();
  });

  it('destroys the whole run behind CSRF protection', async () => {
    const response = await DELETE(request('DELETE'), { params: Promise.resolve({ id: runId }) });
    expect(response.status).toBe(200);
    expect(mocks.destroyOperationRun).toHaveBeenCalledWith({ pool: expect.anything(), runId, ownerId: user.id });
  });

  it('rejects malformed run ids', async () => {
    const response = await GET(request(), { params: Promise.resolve({ id: 'not-a-uuid' }) });
    expect(response.status).toBe(400);
    expect(mocks.getOperationRun).not.toHaveBeenCalled();
  });
});
