import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  checkRateLimit: vi.fn(),
  query: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));

import { GET } from './route';

const user = { id: '11111111-1111-4111-8111-111111111111', clerkUserId: 'clerk-1', role: 'user' as const };

function request() {
  return new NextRequest('http://localhost/api/users/me/progress');
}

describe('learner progress summary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      expect(params).toEqual([user.id]);
      if (sql.includes('COUNT(c.id)::int AS courses')) {
        return { rows: [{ courses: 3, mastered_courses: 1, completed_lessons: 14, average_mastery: 72 }] };
      }
      if (sql.includes("c.status = 'active'")) {
        return { rows: [{ title: 'Linux Networking', completed_lessons: 4, total_lessons: 8, score: 58 }] };
      }
      if (sql.includes("COUNT(*) FILTER (WHERE started_at IS NOT NULL)")) {
        return { rows: [{ started: 5, running: 1 }] };
      }
      if (sql.includes("i.status NOT IN ('destroyed', 'failed')")) {
        return { rows: [{ name: 'Ubuntu Practice Lab', status: 'running', expires_at: new Date('2026-09-07T13:00:00.000Z') }] };
      }
      if (sql.includes('activity_days')) {
        return { rows: [{ day: '2026-09-07' }, { day: '2026-09-06' }, { day: '2026-09-05' }, { day: '2026-09-03' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns owner-scoped learning, lab and streak statistics', async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.progress).toEqual({
      academy: {
        courses: 3,
        masteredCourses: 1,
        completedLessons: 14,
        averageMastery: 72,
        activeCourse: {
          title: 'Linux Networking',
          completedLessons: 4,
          totalLessons: 8,
          score: 58,
        },
      },
      labs: {
        started: 5,
        running: 1,
        activeLab: {
          name: 'Ubuntu Practice Lab',
          status: 'running',
          expiresAt: '2026-09-07T13:00:00.000Z',
        },
      },
      activity: {
        streakDays: 3,
        activeDays: 4,
      },
    });
    expect(mocks.query).toHaveBeenCalledTimes(5);
  });

  it('passes the authenticated user id to the rate limit and every database query', async () => {
    await GET(request());

    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { maxRequests: 60, windowMs: 60_000 },
      user.id
    );
    for (const call of mocks.query.mock.calls) expect(call[1]).toEqual([user.id]);
  });
});
