import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import type { LearnerProgressSummary, LearningActivityDay } from '@/lib/learning/progress-contract';
import { buildLearningRewards } from '@/lib/learning/rewards';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

function dayNumber(value: string): number {
  return Math.floor(new Date(`${value}T00:00:00.000Z`).getTime() / 86_400_000);
}

function uniqueSortedDays(days: string[]): string[] {
  return Array.from(new Set(days.filter(Boolean))).sort();
}

function calculateCurrentStreak(days: string[]): number {
  const unique = uniqueSortedDays(days);
  if (unique.length === 0) return 0;

  const today = Math.floor(Date.now() / 86_400_000);
  const latest = dayNumber(unique[unique.length - 1]);
  if (latest < today - 1) return 0;

  let streak = 1;
  let previous = latest;
  for (let index = unique.length - 2; index >= 0; index -= 1) {
    const current = dayNumber(unique[index]);
    if (previous - current !== 1) break;
    streak += 1;
    previous = current;
  }
  return streak;
}

function calculateLongestStreak(days: string[]): number {
  const unique = uniqueSortedDays(days);
  if (unique.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let index = 1; index < unique.length; index += 1) {
    if (dayNumber(unique[index]) - dayNumber(unique[index - 1]) === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

function buildActivityHistory(rows: Array<Record<string, unknown>>): LearningActivityDay[] {
  const byDate = new Map<string, { academy: number; labs: number }>();
  for (const row of rows) {
    const date = String(row.day || '');
    if (!date) continue;
    byDate.set(date, {
      academy: Number(row.academy) > 0 ? 1 : 0,
      labs: Number(row.labs) > 0 ? 1 : 0,
    });
  }

  const today = Math.floor(Date.now() / 86_400_000);
  const history: LearningActivityDay[] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date((today - offset) * 86_400_000).toISOString().slice(0, 10);
    const value = byDate.get(date) || { academy: 0, labs: 0 };
    history.push({ date, academy: value.academy, labs: value.labs, total: value.academy + value.labs });
  }
  return history;
}

async function loadLearningActivity(ownerId: string): Promise<Array<Record<string, unknown>>> {
  const pool = getPool();
  const withLedger = `
    WITH learning_days AS (
      SELECT activity_date AS day, true AS academy, false AS labs
      FROM learning_activity_days
      WHERE owner_id = $1 AND academy_actions > 0

      UNION

      SELECT (last_activity_at AT TIME ZONE 'UTC')::date AS day, true AS academy, false AS labs
      FROM academy_sessions
      WHERE owner_id = $1

      UNION

      SELECT (created_at AT TIME ZONE 'UTC')::date AS day, true AS academy, false AS labs
      FROM academy_practice_attempts
      WHERE owner_id = $1

      UNION

      SELECT (started_at AT TIME ZONE 'UTC')::date AS day, false AS academy, true AS labs
      FROM lab_instances
      WHERE owner_id = $1 AND started_at IS NOT NULL
    )
    SELECT day::text,
           MAX(CASE WHEN academy THEN 1 ELSE 0 END)::int AS academy,
           MAX(CASE WHEN labs THEN 1 ELSE 0 END)::int AS labs
    FROM learning_days
    GROUP BY day
    ORDER BY day ASC`;

  try {
    const result = await pool.query(withLedger, [ownerId]);
    return result.rows;
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== '42P01') throw error;

    // A deployment can safely precede migration 038. Existing durable records
    // remain a truthful, though less complete, source until the ledger exists.
    const fallback = await pool.query(
      `WITH learning_days AS (
         SELECT (last_activity_at AT TIME ZONE 'UTC')::date AS day, true AS academy, false AS labs
         FROM academy_sessions
         WHERE owner_id = $1

         UNION

         SELECT (created_at AT TIME ZONE 'UTC')::date AS day, true AS academy, false AS labs
         FROM academy_practice_attempts
         WHERE owner_id = $1

         UNION

         SELECT (started_at AT TIME ZONE 'UTC')::date AS day, false AS academy, true AS labs
         FROM lab_instances
         WHERE owner_id = $1 AND started_at IS NOT NULL
       )
       SELECT day::text,
              MAX(CASE WHEN academy THEN 1 ELSE 0 END)::int AS academy,
              MAX(CASE WHEN labs THEN 1 ELSE 0 END)::int AS labs
       FROM learning_days
       GROUP BY day
       ORDER BY day ASC`,
      [ownerId]
    );
    return fallback.rows;
  }
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const pool = getPool();
    const [academyResult, activeCourseResult, labsResult, activeLabResult, runtimeResult, activityRows] = await Promise.all([
      pool.query(
        `SELECT COUNT(c.id)::int AS courses,
                COUNT(c.id) FILTER (WHERE m.status = 'mastered')::int AS mastered_courses,
                COALESCE(SUM(m.completed_lessons), 0)::int AS completed_lessons,
                COALESCE(SUM(m.passed_practices), 0)::int AS passed_practices,
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
        `WITH owned_labs AS (
           SELECT id, status, started_at, stopped_at, updated_at
           FROM lab_instances
           WHERE owner_id = $1 AND started_at IS NOT NULL
         ), transitions AS (
           SELECT id AS lab_instance_id, started_at AS transition_at, 'run_start'::text AS kind
           FROM owned_labs

           UNION ALL

           SELECT event.lab_instance_id,
                  event.created_at AS transition_at,
                  CASE WHEN event.event_type = 'start' THEN 'run_start' ELSE 'run_stop' END AS kind
           FROM lab_events event
           JOIN owned_labs lab ON lab.id = event.lab_instance_id
           WHERE event.event_type IN ('start', 'stop', 'destroy', 'expired_cleanup')
         ), ordered AS (
           SELECT transition.*,
                  LEAD(transition_at) OVER (
                    PARTITION BY lab_instance_id
                    ORDER BY transition_at, CASE WHEN kind = 'run_stop' THEN 0 ELSE 1 END
                  ) AS next_transition_at
           FROM transitions transition
         )
         SELECT COALESCE(ROUND(SUM(
           CASE WHEN ordered.kind = 'run_start' THEN
             GREATEST(
               0,
               EXTRACT(EPOCH FROM (
                 COALESCE(
                   ordered.next_transition_at,
                   CASE WHEN lab.status = 'running'
                     THEN NOW()
                     ELSE COALESCE(lab.stopped_at, lab.updated_at, ordered.transition_at)
                   END
                 ) - ordered.transition_at
               )) / 60
             )
           ELSE 0 END
         )), 0)::int AS runtime_minutes
         FROM ordered
         JOIN owned_labs lab ON lab.id = ordered.lab_instance_id`,
        [user.id]
      ),
      loadLearningActivity(user.id),
    ]);

    const academy = academyResult.rows[0] || {};
    const activeCourse = activeCourseResult.rows[0];
    const labs = labsResult.rows[0] || {};
    const activeLab = activeLabResult.rows[0];
    const runtime = runtimeResult.rows[0] || {};
    const days = activityRows.map((row) => String(row.day || '')).filter(Boolean);
    const streakDays = calculateCurrentStreak(days);
    const longestStreakDays = calculateLongestStreak(days);
    const activeDays = uniqueSortedDays(days).length;

    const academySummary = {
      courses: Number(academy.courses) || 0,
      masteredCourses: Number(academy.mastered_courses) || 0,
      completedLessons: Number(academy.completed_lessons) || 0,
      passedPractices: Number(academy.passed_practices) || 0,
      averageMastery: Number(academy.average_mastery) || 0,
      activeCourse: activeCourse ? {
        title: String(activeCourse.title || 'Current course'),
        completedLessons: Number(activeCourse.completed_lessons) || 0,
        totalLessons: Number(activeCourse.total_lessons) || 0,
        score: Number(activeCourse.score) || 0,
      } : null,
    };

    const labsSummary = {
      started: Number(labs.started) || 0,
      running: Number(labs.running) || 0,
      runtimeMinutes: Math.max(0, Number(runtime.runtime_minutes) || 0),
      activeLab: activeLab ? {
        name: String(activeLab.name || 'Cyber Lab'),
        status: String(activeLab.status || 'created'),
        expiresAt: activeLab.expires_at ? new Date(activeLab.expires_at).toISOString() : null,
      } : null,
    };

    const summary: LearnerProgressSummary = {
      academy: academySummary,
      labs: labsSummary,
      activity: {
        streakDays,
        longestStreakDays,
        activeDays,
        history: buildActivityHistory(activityRows),
      },
      rewards: buildLearningRewards({
        completedLessons: academySummary.completedLessons,
        masteredCourses: academySummary.masteredCourses,
        passedPractices: academySummary.passedPractices,
        labsStarted: labsSummary.started,
        activeDays,
        longestStreakDays,
      }),
    };

    return NextResponse.json({ progress: summary }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
