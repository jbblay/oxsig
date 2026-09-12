import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
  getConfiguredLabCapabilities: vi.fn(),
  reconcileOwnedLabReadModel: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/labs/read-model', () => ({
  getConfiguredLabCapabilities: mocks.getConfiguredLabCapabilities,
}));
vi.mock('@/lib/labs/reconciliation', () => ({
  reconcileOwnedLabReadModel: mocks.reconcileOwnedLabReadModel,
}));

import { POST } from './route';

const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', clerkUserId: 'clerk-user', role: 'user' as const };

function request() {
  return new NextRequest('http://localhost/api/labs/reconcile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/labs/reconcile', () => {
  const pool = { connect: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue(pool);
    mocks.getConfiguredLabCapabilities.mockReturnValue({ configured: true, supportsTerminal: true });
    mocks.reconcileOwnedLabReadModel.mockResolvedValue({
      checkedAt: '2026-09-12T08:00:00.000Z',
      reconciled: 1,
      failed: 0,
      cleanupRequested: 0,
      skipped: false,
    });
  });

  it('keeps reconciliation behind authentication, CSRF, and rate limiting', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.reconcileOwnedLabReadModel).not.toHaveBeenCalled();
  });

  it('runs one authenticated reconciliation against the owned Lab read model', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('server-timing')).toContain('reconcile;dur=');
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { maxRequests: 30, windowMs: 60_000 },
      user.id,
      'lab-status-reconcile'
    );
    expect(mocks.reconcileOwnedLabReadModel).toHaveBeenCalledWith(pool, user.id);
    expect(body).toMatchObject({ ok: true, reconciled: 1, failed: 0, skipped: false });
  });

  it('does not call AWS reconciliation when the deployment is not configured', async () => {
    mocks.getConfiguredLabCapabilities.mockReturnValue({ configured: false, supportsTerminal: false });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, skipped: true, reason: 'runtime_unconfigured' });
    expect(mocks.reconcileOwnedLabReadModel).not.toHaveBeenCalled();
  });
});
