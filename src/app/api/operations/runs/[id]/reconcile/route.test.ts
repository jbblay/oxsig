import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
  getLearnerOperationRun: vi.fn(),
  getOperationRun: vi.fn(),
  getOperationLifecycleProgress: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/operations/run-view', () => ({
  getLearnerOperationRun: mocks.getLearnerOperationRun,
  OperationRunReadError: class OperationRunReadError extends Error {
    constructor(message: string, readonly status = 404, readonly code = 'OPERATION_RUN_NOT_FOUND') { super(message); }
  },
}));
vi.mock('@/lib/operations/runtime', () => ({
  getOperationRun: mocks.getOperationRun,
  OperationRuntimeError: class OperationRuntimeError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'OPERATION_RUNTIME_CONFLICT') { super(message); }
  },
}));
vi.mock('@/lib/operations/lifecycle', () => ({
  getOperationLifecycleProgress: mocks.getOperationLifecycleProgress,
  OperationLifecycleError: class OperationLifecycleError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'OPERATION_LIFECYCLE_CONFLICT') { super(message); }
  },
}));

import { POST } from './route';

const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', clerkUserId: 'clerk-user', role: 'user' as const };
const pool = {};

function request() {
  return new NextRequest(`http://localhost/api/operations/runs/${runId}/reconcile`, {
    method: 'POST',
    headers: { 'x-csrf-token': 'token' },
  });
}

describe('Operation reconcile API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue(pool);
    mocks.getLearnerOperationRun.mockResolvedValue({ id: runId, status: 'provisioning', metadata: {}, nodes: [] });
    mocks.getOperationRun.mockResolvedValue({ id: runId, status: 'running', metadata: {}, nodes: [] });
    mocks.getOperationLifecycleProgress.mockResolvedValue({ phase: 'paused', total: 3, stopped: 3, nodeStates: {} });
  });

  it('reconciles a transitional run through the provider-aware runtime path', async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: runId }) });
    expect(response.status).toBe(200);
    expect(mocks.getLearnerOperationRun).toHaveBeenCalledWith({ pool, runId, ownerId: user.id });
    expect(mocks.getOperationRun).toHaveBeenCalledWith({ pool, runId, ownerId: user.id });
  });

  it('does not touch AWS reconciliation for a terminal run', async () => {
    mocks.getLearnerOperationRun.mockResolvedValue({ id: runId, status: 'destroyed', metadata: {}, nodes: [] });
    const response = await POST(request(), { params: Promise.resolve({ id: runId }) });
    expect(response.status).toBe(200);
    expect(mocks.getOperationRun).not.toHaveBeenCalled();
    expect(mocks.getOperationLifecycleProgress).not.toHaveBeenCalled();
  });

  it('confirms paused lifecycle state only on the explicit control-plane request', async () => {
    mocks.getOperationRun.mockResolvedValue({
      id: runId,
      status: 'provisioning',
      metadata: { lifecycleState: 'paused' },
      nodes: [{ id: 'node-1' }, { id: 'node-2' }, { id: 'node-3' }],
    });
    const response = await POST(request(), { params: Promise.resolve({ id: runId }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.getOperationLifecycleProgress).toHaveBeenCalledWith({ pool, runId, ownerId: user.id });
    expect(body.lifecycle.phase).toBe('paused');
  });

  it('requires CSRF before provider reconciliation', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    const response = await POST(request(), { params: Promise.resolve({ id: runId }) });
    expect(response.status).toBe(403);
    expect(mocks.getOperationRun).not.toHaveBeenCalled();
  });
});
