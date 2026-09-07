import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  query: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));

import { DELETE } from './route';

const user = { id: '11111111-1111-4111-8111-111111111111', clerkUserId: 'clerk-1', role: 'user' as const };

function request() {
  return new NextRequest('http://localhost/api/academy/reset', { method: 'DELETE' });
}

describe('Academy full reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('deletes Academy courses only for the authenticated owner', async () => {
    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith(
      'DELETE FROM academy_courses WHERE owner_id = $1',
      [user.id]
    );
  });

  it('rejects a reset without a valid CSRF token before touching persistence', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await DELETE(request());

    expect(response.status).toBe(403);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('uses a fail-closed destructive-action rate limit', async () => {
    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { maxRequests: 3, windowMs: 60 * 60 * 1000, failClosed: true },
      user.id
    );
  });
});
