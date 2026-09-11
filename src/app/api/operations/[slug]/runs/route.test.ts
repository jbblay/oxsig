import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
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
    mocks.getPool.mockReturnValue({});
    mocks.provisionRegisteredOperationRun.mockResolvedValue({
      runId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      operatorLabInstanceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      expiresAt: '2099-01-01T00:00:00.000Z',
      status: 'provisioning',
    });
  });

  it('starts the requested registered Operation mode', async () => {
    const response = await POST(request({ mode: 'practice' }), { params: Promise.resolve({ slug: 'black-domain' }) });
    expect(response.status).toBe(201);
    expect(mocks.provisionRegisteredOperationRun).toHaveBeenCalledWith({
      pool: expect.anything(), ownerId: user.id, slug: 'black-domain', mode: 'practice',
    });
  });

  it('rejects unsupported modes before provisioning', async () => {
    const response = await POST(request({ mode: 'root-everything' }), { params: Promise.resolve({ slug: 'black-domain' }) });
    expect(response.status).toBe(400);
    expect(mocks.provisionRegisteredOperationRun).not.toHaveBeenCalled();
  });

  it('requires CSRF protection for an expensive provisioning write', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    const response = await POST(request({ mode: 'challenge' }), { params: Promise.resolve({ slug: 'black-domain' }) });
    expect(response.status).toBe(403);
    expect(mocks.provisionRegisteredOperationRun).not.toHaveBeenCalled();
  });
});
