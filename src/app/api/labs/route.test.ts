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

vi.mock('server-only', () => ({}));
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

import { GET, POST } from './route';

const user = { id: 'user-1', clerkUserId: 'clerk-1', role: 'user' as const };

function request(body: unknown = { slug: 'ubuntu-security-lab', accessMode: 'terminal' }) {
  return new NextRequest('http://localhost/api/labs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('GET /api/labs fast persisted read model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
  });

  it('returns persisted state without waiting for slow AWS capability or reconciliation calls', async () => {
    const observedAt = new Date(Date.now() - 120_000).toISOString();
    mocks.query.mockResolvedValueOnce({
      rows: [{
        id: 'lab-1',
        slug: 'ubuntu-security-lab',
        name: 'Ubuntu Security Lab',
        status: 'running',
        runtime_provider: 'aws-ec2',
        runtime_external_id: 'i-0123456789abcdef0',
        created_at: '2026-09-12T00:00:00.000Z',
        started_at: '2026-09-12T00:01:00.000Z',
        expires_at: '2099-01-01T00:00:00.000Z',
        runtime_observed_at: observedAt,
        reconciliation_warning: 'Lab status could not be confirmed with the cloud provider. Showing the last known state.',
        metadata: { accessMode: 'terminal' },
      }],
    });

    const never = new Promise(() => undefined);
    mocks.labCapabilities.mockReturnValue(never);
    mocks.describeLabVmStates.mockReturnValue(never);

    const response = await Promise.race([
      GET(new NextRequest('http://localhost/api/labs')),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 250)),
    ]);

    expect(response).not.toBe('timeout');
    expect(response).toBeInstanceOf(NextResponse);
    const body = await (response as NextResponse).json();

    expect(body.instances).toEqual([
      expect.objectContaining({
        id: 'lab-1',
        status: 'running',
        observedAt,
        stale: true,
        reconciliationWarning: expect.stringContaining('last known state'),
      }),
    ]);
    expect(body.reconciliationWarning).toContain('last known state');
    expect(mocks.labCapabilities).not.toHaveBeenCalled();
    expect(mocks.describeLabVmStates).not.toHaveBeenCalled();
    expect(mocks.destroyLabVm).not.toHaveBeenCalled();
  });

  it('reports an unobserved persisted state as stale instead of treating it as provider-confirmed', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{
        id: 'lab-2',
        slug: 'ubuntu-security-lab',
        name: 'Ubuntu Security Lab',
        status: 'provisioning',
        runtime_provider: 'aws-ec2',
        runtime_external_id: 'i-0123456789abcdef1',
        created_at: '2026-09-12T00:00:00.000Z',
        started_at: null,
        expires_at: '2099-01-01T00:00:00.000Z',
        runtime_observed_at: null,
        reconciliation_warning: null,
        metadata: { accessMode: 'terminal' },
      }],
    });

    const response = await GET(new NextRequest('http://localhost/api/labs'));
    const body = await response.json();

    expect(body.instances[0]).toMatchObject({
      id: 'lab-2',
      status: 'provisioning',
      observedAt: null,
      stale: true,
      reconciliationWarning: null,
    });
    expect(body.reconciliationWarning).toContain('last provider observation');
  });
});

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

  it('rejects an Operations-owned profile before provider or database provisioning', async () => {
    const response = await POST(request({
      slug: 'operation-black-domain-operator',
      accessMode: 'terminal',
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: 'LAB_LAUNCH_SURFACE_RESTRICTED',
      error: 'This managed profile is launched only from Operations > Black Domain.',
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.labCapabilities).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.createLabVm).not.toHaveBeenCalled();
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
