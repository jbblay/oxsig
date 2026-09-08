import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
  getOperationRun: vi.fn(),
  destroyOperationRun: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/operations/runtime', () => ({
  getOperationRun: mocks.getOperationRun,
  destroyOperationRun: mocks.destroyOperationRun,
  OperationRuntimeError: class OperationRuntimeError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'OPERATION_RUNTIME_CONFLICT') { super(message); }
  },
}));

import { DELETE, GET } from './route';

const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', clerkUserId: 'clerk-user', role: 'user' as const };

function request(method = 'GET') {
  return new NextRequest(`http://localhost/api/operations/runs/${runId}`, { method });
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
  });

  it('returns only the authenticated owner run', async () => {
    const response = await GET(request(), { params: Promise.resolve({ id: runId }) });
    expect(response.status).toBe(200);
    expect(mocks.getOperationRun).toHaveBeenCalledWith({ pool: expect.anything(), runId, ownerId: user.id });
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
