import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({
  getPool: () => ({
    connect: async () => ({ query: mocks.query, release: mocks.release }),
  }),
}));

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
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('public.learning_path_enrollments')")) return { rows: [{ relation: 'learning_path_enrollments' }] };
      if (sql.includes("to_regclass('public.learning_activity_days')")) return { rows: [{ relation: 'learning_activity_days' }] };
      return { rows: [], rowCount: 1 };
    });
  });

  it('atomically deletes Academy history, capability state, and only the Academy side of daily activity', async () => {
    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.query).toHaveBeenCalledWith('BEGIN');
    expect(mocks.query).toHaveBeenCalledWith(
      'DELETE FROM academy_courses WHERE owner_id = $1',
      [user.id]
    );
    expect(mocks.query).toHaveBeenCalledWith(
      'DELETE FROM learning_path_enrollments WHERE owner_id = $1',
      [user.id]
    );
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('SET academy_actions = 0'),
      [user.id]
    );
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('academy_actions = 0 AND lab_actions = 0'),
      [user.id]
    );
    expect(mocks.query).toHaveBeenCalledWith('COMMIT');
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it('still resets Academy safely when capability and analytics migrations are not installed yet', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return { rows: [{ relation: null }] };
      return { rows: [], rowCount: 1 };
    });

    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith('DELETE FROM academy_courses WHERE owner_id = $1', [user.id]);
    expect(mocks.query).not.toHaveBeenCalledWith('DELETE FROM learning_path_enrollments WHERE owner_id = $1', [user.id]);
    expect(mocks.query).not.toHaveBeenCalledWith(expect.stringContaining('SET academy_actions = 0'), expect.anything());
    expect(mocks.query).toHaveBeenCalledWith('COMMIT');
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
