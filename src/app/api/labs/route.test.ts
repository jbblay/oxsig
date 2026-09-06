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

function request(body: unknown = { slug: 'ubuntu-security-lab', accessMode: 'terminal' }) {
  return new NextRequest('http://localhost/api/labs', {
    method: 'POST',
    body: JSON.stringify(body),
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
    mocks.labCapabilities.mockResolvedValue({ configured: true, provider: 'aws-ec2' });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT COUNT(*)::int AS count')) return { rows: [{ count: 0 }] };
      throw new Error(`Unexpected query: ${sql.slice(0, 80)}`);
    });
  });

  it('keeps authentication and CSRF outside all provisioning throttles', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('applies ordinary abuse throttling before request parsing', async () => {
    const limited = NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    mocks.checkRateLimit.mockResolvedValueOnce(limited);

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { maxRequests: 20, windowMs: 60_000 },
      user.id
    );
    expect(mocks.labCapabilities).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('does not burn the cost bucket for an invalid lab request', async () => {
    const response = await POST(request({ slug: 'does-not-exist', accessMode: 'terminal' }));

    expect(response.status).toBe(400);
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { maxRequests: 20, windowMs: 60_000 },
      user.id
    );
    expect(mocks.labCapabilities).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('shares the tight named provisioning bucket only after the request is provisionable', async () => {
    const limited = NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    mocks.checkRateLimit
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(limited);

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(mocks.labCapabilities).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.any(NextRequest),
      { maxRequests: 2, windowMs: 3_600_000 },
      user.id,
      'lab-provision'
    );
    expect(mocks.createLabVm).not.toHaveBeenCalled();
  });
});
