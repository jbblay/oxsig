import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

type ProgressSummary = {
  academy: {
    courses: number;
    masteredCourses: number;
    completedLessons: number;
    averageMastery: number;
    activeCourse: {
      title: string;
      completedLessons: number;
      totalLessons: number;
      score: number;
    } | null;
  };
  labs: {
    started: number;
    running: number;
    activeLab: {
      name: string;
      status: string;
      expiresAt: string | null;
    } | null;
  };
  activity: {
    streakDays: number;
    activeDays: number;
  };
};

function dayNumber(value: string): number {
  return Math.floor(new Date(`${value}T00:00:00.000Z`).getTime() / 86_400_000);
}

function calculateStreak(days: string[]): number {
  if (days.length === 0) return 0;
  const unique = Array.from(new Set(days)).sort().reverse();
  const today = Math.floor(Date.now() / 86_400_000);
  const latest = dayNumber(unique[0]);
  if (latest < today - 1) return 0;

  let streak = 1;
  let previous = latest;
  for (const value of unique.slice(1)) {
    const current = dayNumber(value);
    if (previous - current !== 1) break;
    streak += 1;
    previous = current;
  }
  return streak;
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const pool = getPool();
    const [academyResult, activeCourseResult, labsResult, activeLabResult, activityResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(c.id)::int AS courses,
                COUNT(c.id) FILTER (WHERE m.status = 'mastered')::int AS mastered_courses,
                COALESCE(SUM(m.completed_lessons), 0)::int AS completed_lessons,
                COALESCE(ROUND(AVG(m.score)), 0)::int AS average_mastery
         FROM academy_courses c
         LEFT JOIN academy_mastery m ON m.course_id = c.id AND m.owner_id = c.owner_id
         WHERE c.owner_id = $1`,
        [user.id]
      ),
      pool.query(
        `SELECT c.course_data->>'title' AS title,
                COALESCE(m.completed_lessons, 0)::int AS completed_lessons,
                COALESCE(m.total_lessons, jsonb_array_length(c.course_data->'lessons'))::int AS total_lessons,
                COALESCE(m.score, 0)::int AS score
         FROM academy_courses c
         LEFT JOIN academy_mastery m ON m.course_id = c.id AND m.owner_id = c.owner_id
         WHERE c.owner_id = $1 AND c.status = 'active'
         ORDER BY c.created_at DESC
         LIMIT 1`,
        [user.id]
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE started_at IS NOT NULL)::int AS started,
                COUNT(*) FILTER (WHERE status = 'running')::int AS running
         FROM lab_instances
         WHERE owner_id = $1`,
        [user.id]
      ),
      pool.query(
        `SELECT d.name, i.status, i.expires_at
         FROM lab_instances i
         JOIN lab_definitions d ON d.id = i.definition_id
         WHERE i.owner_id = $1
           AND i.status NOT IN ('destroyed', 'failed')
         ORDER BY i.created_at DESC
         LIMIT 1`,
        [user.id]
      ),
      pool.query(
        `SELECT day::text
         FROM (
           SELECT (last_activity_at AT TIME ZONE 'UTC')::date AS day
           FROM academy_sessions
           WHERE owner_id = $1
           UNION
           SELECT (COALESCE(started_at, created_at) AT TIME ZONE 'UTC')::date AS day
           FROM lab_instances
           WHERE owner_id = $1 AND (started_at IS NOT NULL OR status NOT IN ('created', 'destroyed'))
           UNION
           SELECT (created_at AT TIME ZONE 'UTC')::date AS day
           FROM audit_logs
           WHERE user_id = $1
         ) activity_days
         ORDER BY day DESC
         LIMIT 366`,
        [user.id]
      ),
    ]);

    const academy = academyResult.rows[0] || {};
    const activeCourse = activeCourseResult.rows[0];
    const labs = labsResult.rows[0] || {};
    const activeLab = activeLabResult.rows[0];
    const days = activityResult.rows.map((row) => String(row.day));

    const summary: ProgressSummary = {
      academy: {
        courses: Number(academy.courses) || 0,
        masteredCourses: Number(academy.mastered_courses) || 0,
        completedLessons: Number(academy.completed_lessons) || 0,
        averageMastery: Number(academy.average_mastery) || 0,
        activeCourse: activeCourse ? {
          title: String(activeCourse.title || 'Current course'),
          completedLessons: Number(activeCourse.completed_lessons) || 0,
          totalLessons: Number(activeCourse.total_lessons) || 0,
          score: Number(activeCourse.score) || 0,
        } : null,
      },
      labs: {
        started: Number(labs.started) || 0,
        running: Number(labs.running) || 0,
        activeLab: activeLab ? {
          name: String(activeLab.name || 'Cyber Lab'),
          status: String(activeLab.status || 'created'),
          expiresAt: activeLab.expires_at ? new Date(activeLab.expires_at).toISOString() : null,
        } : null,
      },
      activity: {
        streakDays: calculateStreak(days),
        activeDays: days.length,
      },
    };

    return NextResponse.json({ progress: summary }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
