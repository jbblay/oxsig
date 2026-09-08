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
vi.mock('@/lib/operations/runtime', () => ({ destroyOperationRun: mocks.destroyOperationRun }));
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
    mocks.destroyOperationRun.mockResolvedValue({ destroyed: true, alreadyDestroyed: false, terminating: 3 });
  });

  it('destroys the whole Operation when its operator lab is destroyed', async () => {
    const response = await PATCH(request('destroy'), { params: Promise.resolve({ id: labId }) });
    expect(response.status).toBe(200);
    expect(mocks.destroyOperationRun).toHaveBeenCalledWith({ pool, runId, ownerId: user.id });
    expect(mocks.destroyLabVm).not.toHaveBeenCalled();
  });
});
