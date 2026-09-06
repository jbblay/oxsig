import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  query: vi.fn(),
  labCapabilities: vi.fn(),
  createLabVm: vi.fn(),
  describeLabVmStates: vi.fn(),
  destroyLabVm: vi.fn(),
  logAudit: vi.fn(),
  captureProductEvent: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  RATE_LIMITS: { LAB_PROVISION: { maxRequests: 2, windowMs: 3_600_000 } },
}));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock('@/lib/labs/aws-runtime', () => ({
  labCapabilities: mocks.labCapabilities,
  createLabVm: mocks.createLabVm,
  describeLabVmStates: mocks.describeLabVmStates,
  destroyLabVm: mocks.destroyLabVm,
}));
vi.mock('@/lib/audit/logger', () => ({
  AUDIT_ACTIONS: { LAB_CREATE: 'lab.create' },
  getRequestMetadata: () => ({}),
  logAudit: mocks.logAudit,
}));
vi.mock('@/lib/analytics/posthog', () => ({ captureProductEvent: mocks.captureProductEvent }));

import { POST } from './route';

const user = { id: 'user-1', clerkUserId: 'clerk-1', role: 'user' as const };

function request() {
  return new NextRequest('http://localhost/api/labs', {
    method: 'POST',
    body: JSON.stringify({ slug: 'ubuntu-security-lab', accessMode: 'terminal' }),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/labs provisioning cost boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
  });

  it('keeps authentication and CSRF outside the cost-bearing throttle', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('shares the tight named provisioning bucket with Designer execution', async () => {
    mocks.checkRateLimit.mockResolvedValue(NextResponse.json({ error: 'Too Many Requests' }, { status: 429 }));

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { maxRequests: 2, windowMs: 3_600_000 },
      user.id,
      'lab-provision'
    );
    expect(mocks.labCapabilities).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
