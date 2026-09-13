import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
  poolQuery: vi.fn(),
  provisionRegisteredOperationRun: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/operations/runtime-registry', () => ({
  provisionRegisteredOperationRun: mocks.provisionRegisteredOperationRun,
  OperationRuntimeError: class OperationRuntimeError extends Error {
    constructor(message: string, readonly status = 409, readonly code = 'OPERATION_RUNTIME_CONFLICT') { super(message); }
  },
}));

import { POST } from './route';

const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', clerkUserId: 'clerk-user', role: 'user' as const };
const pool = { query: mocks.poolQuery };

function request(body: unknown) {
  return new NextRequest('http://localhost/api/operations/black-domain/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Operation provisioning API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.poolQuery.mockResolvedValue({ rows: [] });
    mocks.getPool.mockReturnValue(pool);
    mocks.provisionRegisteredOperationRun.mockResolvedValue({
      runId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      operatorLabInstanceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      expiresAt: '2099-01-01T00:00:00.000Z',
      status: 'provisioning',
    });
  });

  it('starts the requested registered Operation mode after preflight', async () => {
    const response = await POST(request({ mode: 'practice' }), { params: Promise.resolve({ slug: 'black-domain' }) });
    expect(response.status).toBe(201);
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.provisionRegisteredOperationRun).toHaveBeenCalledWith({
      pool, ownerId: user.id, slug: 'black-domain', mode: 'practice',
    });
  });

  it('returns the matching active run without consuming provisioning quota', async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        operation_slug: 'black-domain',
        mode: 'practice',
        status: 'running',
        operator_lab_instance_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        environment_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        expires_at: '2099-01-01T00:00:00.000Z',
      }],
    });

    const response = await POST(request({ mode: 'practice' }), { params: Promise.resolve({ slug: 'black-domain' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ reused: true, run: { runId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', status: 'running' } });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.provisionRegisteredOperationRun).not.toHaveBeenCalled();
  });

  it('rejects an occupied Cyber Lab slot before consuming provisioning quota', async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'lab-1' }] });

    const response = await POST(request({ mode: 'practice' }), { params: Promise.resolve({ slug: 'black-domain' }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('OPERATION_LAB_SLOT_OCCUPIED');
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.provisionRegisteredOperationRun).not.toHaveBeenCalled();
  });

  it('rejects a resetting prepared environment before consuming provisioning quota', async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'resetting' }] });

    const response = await POST(request({ mode: 'practice' }), { params: Promise.resolve({ slug: 'black-domain' }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('OPERATION_ENVIRONMENT_BUSY');
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.provisionRegisteredOperationRun).not.toHaveBeenCalled();
  });

  it('rejects unsupported modes before provisioning', async () => {
    const response = await POST(request({ mode: 'root-everything' }), { params: Promise.resolve({ slug: 'black-domain' }) });
    expect(response.status).toBe(400);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(mocks.provisionRegisteredOperationRun).not.toHaveBeenCalled();
  });

  it('requires CSRF protection for an expensive provisioning write', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    const response = await POST(request({ mode: 'challenge' }), { params: Promise.resolve({ slug: 'black-domain' }) });
    expect(response.status).toBe(403);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(mocks.provisionRegisteredOperationRun).not.toHaveBeenCalled();
  });
});
