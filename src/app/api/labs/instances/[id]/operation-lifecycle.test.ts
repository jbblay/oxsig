import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
  describeLabVmStates: vi.fn(),
  destroyLabVm: vi.fn(),
  startLabVm: vi.fn(),
  stopLabVm: vi.fn(),
  pauseOperationRun: vi.fn(),
  resumeOperationRun: vi.fn(),
  destroyOperationRun: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/labs/aws-runtime', () => ({
  describeLabVmStates: mocks.describeLabVmStates,
  destroyLabVm: mocks.destroyLabVm,
  startLabVm: mocks.startLabVm,
  stopLabVm: mocks.stopLabVm,
}));
vi.mock('@/lib/operations/lifecycle', () => ({
  pauseOperationRun: mocks.pauseOperationRun,
  resumeOperationRun: mocks.resumeOperationRun,
  OperationLifecycleError: class OperationLifecycleError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'OPERATION_LIFECYCLE_CONFLICT') { super(message); }
  },
}));
vi.mock('@/lib/operations/runtime', () => ({
  destroyOperationRun: mocks.destroyOperationRun,
  OperationRuntimeError: class OperationRuntimeError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'OPERATION_RUNTIME_CONFLICT') { super(message); }
  },
}));
vi.mock('@/lib/audit/logger', () => ({
  AUDIT_ACTIONS: { LAB_START: 'lab.start', LAB_STOP: 'lab.stop', LAB_DESTROY: 'lab.destroy' },
  getRequestMetadata: vi.fn(() => ({})),
  logAudit: mocks.logAudit,
}));

import { PATCH } from './route';

const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', clerkUserId: 'clerk-user', role: 'user' as const };
const labId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const runId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function request(action: 'start' | 'stop' | 'destroy') {
  return new NextRequest(`http://localhost/api/labs/instances/${labId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

describe('Operation-managed lab lifecycle', () => {
  const query = vi.fn();
  const pool = { query };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue(pool);
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id,status,runtime_provider')) return { rows: [{
        id: labId,
        status: 'running',
        runtime_provider: 'aws-ec2',
        runtime_external_id: 'i-0123456789abcdef0',
        expires_at: '2099-01-01T00:00:00.000Z',
        metadata: { operationRunId: runId },
      }] };
      return { rows: [], rowCount: 1 };
    });
    mocks.pauseOperationRun.mockResolvedValue({ paused: true, alreadyPaused: false, stopping: 3 });
    mocks.resumeOperationRun.mockResolvedValue({ resumed: true, starting: 3 });
    mocks.destroyOperationRun.mockResolvedValue({ destroyed: true, alreadyDestroyed: false, reusableEnvironment: true });
  });

  it('pauses the whole Operation when its operator lab is stopped', async () => {
    const response = await PATCH(request('stop'), { params: Promise.resolve({ id: labId }) });
    expect(response.status).toBe(200);
    expect(mocks.pauseOperationRun).toHaveBeenCalledWith({ pool, runId, ownerId: user.id });
    expect(mocks.stopLabVm).not.toHaveBeenCalled();
    expect(mocks.describeLabVmStates).not.toHaveBeenCalled();
  });

  it('resumes the whole Operation when its operator lab is started', async () => {
    const response = await PATCH(request('start'), { params: Promise.resolve({ id: labId }) });
    expect(response.status).toBe(200);
    expect(mocks.resumeOperationRun).toHaveBeenCalledWith({ pool, runId, ownerId: user.id });
    expect(mocks.startLabVm).not.toHaveBeenCalled();
    expect(mocks.describeLabVmStates).not.toHaveBeenCalled();
  });

  it('destroys or resets the whole Operation when its operator lab is destroyed', async () => {
    const response = await PATCH(request('destroy'), { params: Promise.resolve({ id: labId }) });
    expect(response.status).toBe(200);
    expect(mocks.destroyOperationRun).toHaveBeenCalledWith({ pool, runId, ownerId: user.id });
    expect(mocks.destroyLabVm).not.toHaveBeenCalled();
    expect(mocks.describeLabVmStates).not.toHaveBeenCalled();
  });
  it('releases a failed Operation allocation without an operator EC2 id', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id,status,runtime_provider')) return { rows: [{
        id: labId,
        status: 'failed',
        runtime_provider: 'aws-ec2',
        runtime_external_id: null,
        expires_at: '2026-09-15T11:46:49.000Z',
        metadata: { operationRunId: runId },
      }] };
      return { rows: [], rowCount: 1 };
    });

    const response = await PATCH(request('destroy'), { params: Promise.resolve({ id: labId }) });
    expect(response.status).toBe(200);
    expect((await response.json()).instance.status).toBe('destroyed');
    expect(mocks.destroyOperationRun).toHaveBeenCalledWith({ pool, runId, ownerId: user.id });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET status='destroyed', last_error=NULL"),
      [labId, user.id]
    );
    expect(mocks.destroyLabVm).not.toHaveBeenCalled();
  });

  it('releases a failed ordinary allocation without calling EC2', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id,status,runtime_provider')) return { rows: [{
        id: labId,
        status: 'failed',
        runtime_provider: 'aws-ec2',
        runtime_external_id: null,
        metadata: {},
      }] };
      if (sql.includes("SET status='destroyed'")) return { rows: [{ id: labId, status: 'destroyed' }] };
      return { rows: [], rowCount: 1 };
    });

    const response = await PATCH(request('destroy'), { params: Promise.resolve({ id: labId }) });
    expect(response.status).toBe(200);
    expect((await response.json()).instance.status).toBe('destroyed');
    expect(mocks.destroyOperationRun).not.toHaveBeenCalled();
    expect(mocks.destroyLabVm).not.toHaveBeenCalled();
  });

});
