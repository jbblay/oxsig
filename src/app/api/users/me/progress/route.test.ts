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

function activityRows() {
  return [
    { day: '2026-09-03', academy: 1, labs: 0 },
    { day: '2026-09-05', academy: 1, labs: 0 },
    { day: '2026-09-06', academy: 1, labs: 1 },
    { day: '2026-09-07', academy: 1, labs: 0 },
  ];
}

function installQueryMock(options: { ledgerMissing?: boolean } = {}) {
  let ledgerFailed = false;
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
    expect(params).toEqual([user.id]);
    if (sql.includes('COUNT(c.id)::int AS courses')) {
      return {
        rows: [{
          courses: 3,
          mastered_courses: 1,
          completed_lessons: 14,
          passed_practices: 3,
          average_mastery: 72,
        }],
      };
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
    if (sql.includes('runtime_minutes')) {
      return { rows: [{ runtime_minutes: 190 }] };
    }
    if (sql.includes('learning_activity_days')) {
      if (options.ledgerMissing && !ledgerFailed) {
        ledgerFailed = true;
        const error = new Error('relation does not exist') as Error & { code: string };
        error.code = '42P01';
        throw error;
      }
      return { rows: activityRows() };
    }
    if (sql.includes('WITH learning_days AS')) {
      return { rows: activityRows() };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
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
    installQueryMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns owner-scoped real analytics, rewards and badge progress', async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.progress.academy).toEqual({
      courses: 3,
      masteredCourses: 1,
      completedLessons: 14,
      passedPractices: 3,
      averageMastery: 72,
      activeCourse: {
        title: 'Linux Networking',
        completedLessons: 4,
        totalLessons: 8,
        score: 58,
      },
    });
    expect(body.progress.labs).toEqual({
      started: 5,
      running: 1,
      runtimeMinutes: 190,
      activeLab: {
        name: 'Ubuntu Practice Lab',
        status: 'running',
        expiresAt: '2026-09-07T13:00:00.000Z',
      },
    });
    expect(body.progress.activity.streakDays).toBe(3);
    expect(body.progress.activity.longestStreakDays).toBe(3);
    expect(body.progress.activity.activeDays).toBe(4);
    expect(body.progress.activity.history).toHaveLength(14);
    expect(body.progress.activity.history.find((day: { date: string }) => day.date === '2026-09-06')).toEqual({
      date: '2026-09-06',
      academy: 1,
      labs: 1,
      total: 2,
    });
    expect(body.progress.rewards).toMatchObject({
      xp: 2975,
      level: 3,
      levelName: 'Practitioner',
      levelFloorXp: 1500,
      nextLevelXp: 3000,
      levelProgressPercent: 98,
      badgesEarned: 7,
    });
    expect(body.progress.rewards.badges.find((badge: { id: string }) => badge.id === 'seven-day-streak')).toMatchObject({
      earned: false,
      current: 3,
      target: 7,
    });
    expect(mocks.query).toHaveBeenCalledTimes(6);
  });

  it('reads both Academy and Cyber Lab daily ledger counters', async () => {
    await GET(request());

    const ledgerCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes('learning_activity_days'));
    expect(ledgerCall?.[0]).toContain('academy_actions > 0');
    expect(ledgerCall?.[0]).toContain('lab_actions > 0');
  });

  it('bounds recorded lab runtime with persisted stopped state and lifecycle events', async () => {
    await GET(request());

    const runtimeCall = mocks.query.mock.calls.find(([sql]) => String(sql).includes('runtime_minutes'));
    expect(runtimeCall?.[0]).toContain("stopped_at AS transition_at");
    expect(runtimeCall?.[0]).toContain("event.event_type IN ('start', 'stop', 'destroy', 'expired_cleanup')");
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

  it('falls back to existing durable activity when migration 038 is not applied yet', async () => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.checkRateLimit.mockResolvedValue(null);
    installQueryMock({ ledgerMissing: true });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.progress.activity).toMatchObject({ streakDays: 3, longestStreakDays: 3, activeDays: 4 });
    expect(mocks.query).toHaveBeenCalledTimes(7);
  });
});
