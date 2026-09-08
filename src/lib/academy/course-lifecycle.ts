import 'server-only';

import { getPool } from '@/lib/db/pool';
import { detachOwnerResourceFromLiveWorkspaces } from '@/lib/live-workspace/resource-lifecycle';
import type { AcademyCourse } from './types';

export type OwnedAcademyCourse = {
  courseId: string;
  course: AcademyCourse;
  courseStatus: 'active' | 'archived';
  activeIndex: number;
  completedLessons: number;
  totalLessons: number;
  masteryScore: number;
  masteryStatus: 'in_progress' | 'mastered';
  sessionStatus: 'active' | 'completed' | 'abandoned' | null;
  createdAt: string;
  updatedAt: string;
};

function mapOwnedCourse(row: Record<string, any>): OwnedAcademyCourse {
  const course = row.course_data as AcademyCourse;
  return {
    courseId: row.id as string,
    course,
    courseStatus: row.course_status as 'active' | 'archived',
    activeIndex: Number(row.active_lesson_index) || 0,
    completedLessons: Number(row.completed_lessons) || 0,
    totalLessons: Number(row.total_lessons) || course.lessons.length,
    masteryScore: Number(row.mastery_score) || 0,
    masteryStatus: (row.mastery_status || 'in_progress') as 'in_progress' | 'mastered',
    sessionStatus: row.session_status
      ? row.session_status as 'active' | 'completed' | 'abandoned'
      : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getOwnedAcademyCourse(ownerId: string, courseId: string): Promise<OwnedAcademyCourse | null> {
  const result = await getPool().query(
    `SELECT c.id, c.course_data, c.status AS course_status, c.created_at, c.updated_at,
            COALESCE(p.active_lesson_index, 0) AS active_lesson_index,
            COALESCE(m.completed_lessons, 0) AS completed_lessons,
            COALESCE(m.total_lessons, jsonb_array_length(c.course_data->'lessons')) AS total_lessons,
            COALESCE(m.score, 0) AS mastery_score,
            COALESCE(m.status, 'in_progress') AS mastery_status,
            session.status AS session_status
       FROM academy_courses c
       LEFT JOIN academy_progress p ON p.course_id = c.id AND p.owner_id = c.owner_id
       LEFT JOIN academy_mastery m ON m.course_id = c.id AND m.owner_id = c.owner_id
       LEFT JOIN LATERAL (
         SELECT status
           FROM academy_sessions
          WHERE course_id = c.id AND owner_id = c.owner_id
          ORDER BY started_at DESC
          LIMIT 1
       ) session ON true
      WHERE c.id = $1 AND c.owner_id = $2
      LIMIT 1`,
    [courseId, ownerId]
  );
  return result.rows[0] ? mapOwnedCourse(result.rows[0]) : null;
}

export async function activateAcademyCourse(ownerId: string, courseId: string): Promise<boolean> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query(
      `SELECT id, status
         FROM academy_courses
        WHERE id = $1 AND owner_id = $2
        FOR UPDATE`,
      [courseId, ownerId]
    );
    if (!target.rows[0]) {
      await client.query('ROLLBACK');
      return false;
    }

    if (target.rows[0].status !== 'active') {
      await client.query(
        `UPDATE academy_sessions
            SET status = 'abandoned', last_activity_at = NOW()
          WHERE owner_id = $1 AND status = 'active'`,
        [ownerId]
      );
      await client.query(
        `UPDATE academy_courses
            SET status = 'archived', updated_at = NOW()
          WHERE owner_id = $1 AND status = 'active'`,
        [ownerId]
      );
      await client.query(
        `UPDATE academy_courses
            SET status = 'active', updated_at = NOW()
          WHERE id = $1 AND owner_id = $2`,
        [courseId, ownerId]
      );
      await client.query(
        `INSERT INTO academy_sessions (course_id, owner_id, status)
         VALUES ($1, $2, 'active')`,
        [courseId, ownerId]
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveAcademyCourse(ownerId: string, courseId: string): Promise<boolean> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query(
      `SELECT id, status
         FROM academy_courses
        WHERE id = $1 AND owner_id = $2
        FOR UPDATE`,
      [courseId, ownerId]
    );
    if (!target.rows[0]) {
      await client.query('ROLLBACK');
      return false;
    }

    if (target.rows[0].status === 'active') {
      await client.query(
        `UPDATE academy_sessions
            SET status = 'abandoned', last_activity_at = NOW()
          WHERE owner_id = $1 AND course_id = $2 AND status = 'active'`,
        [ownerId, courseId]
      );
      await client.query(
        `UPDATE academy_courses
            SET status = 'archived', updated_at = NOW()
          WHERE id = $1 AND owner_id = $2`,
        [courseId, ownerId]
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAcademyCourse(ownerId: string, courseId: string): Promise<boolean> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await detachOwnerResourceFromLiveWorkspaces(client, ownerId, 'academy-course', courseId);
    const result = await client.query(
      `DELETE FROM academy_courses
        WHERE id = $1 AND owner_id = $2
        RETURNING id`,
      [courseId, ownerId]
    );
    await client.query('COMMIT');
    return Boolean(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
