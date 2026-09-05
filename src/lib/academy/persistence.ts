import 'server-only';

import { getPool } from '@/lib/db/pool';
import type {
  AcademyCourse,
  AcademyPracticeEvaluation,
  AcademyQuestionAnswer,
} from './types';

type ProgressInput = {
  activeIndex: number;
  completedLessonIds: string[];
};

type StoredQa = {
  question: string;
  answer: AcademyQuestionAnswer;
  createdAt: string;
};

type StoredPracticeResult = {
  execution: {
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
  };
  evaluation: AcademyPracticeEvaluation;
  createdAt: string;
};

export type PersistedAcademyState = {
  courseId: string;
  course: AcademyCourse;
  progress: {
    activeIndex: number;
    completed: string[];
  };
  qa: Record<string, StoredQa[]>;
  practiceResults: Record<string, StoredPracticeResult>;
  updatedAt: string;
};

function asCourse(value: unknown): AcademyCourse {
  return value as AcademyCourse;
}

function lessonIdForTitle(course: AcademyCourse, lessonTitle: string): string | null {
  return course.lessons.find((lesson) => lesson.title === lessonTitle)?.id || null;
}

async function activeCourse(ownerId: string) {
  const result = await getPool().query(
    `SELECT id, course_data, updated_at
     FROM academy_courses
     WHERE owner_id = $1 AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [ownerId]
  );
  return result.rows[0] || null;
}

export async function createAcademyCourse(
  ownerId: string,
  sourcePrompt: string,
  course: AcademyCourse
): Promise<string> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE academy_courses
       SET status = 'archived', updated_at = NOW()
       WHERE owner_id = $1 AND status = 'active'`,
      [ownerId]
    );

    const inserted = await client.query(
      `INSERT INTO academy_courses (owner_id, source_prompt, course_data, status)
       VALUES ($1, $2, $3::jsonb, 'active')
       RETURNING id`,
      [ownerId, sourcePrompt.slice(0, 2000), JSON.stringify(course)]
    );
    const courseId = inserted.rows[0].id as string;

    await client.query(
      `INSERT INTO academy_progress (course_id, owner_id, active_lesson_index, completed_lesson_ids)
       VALUES ($1, $2, 0, '[]'::jsonb)`,
      [courseId, ownerId]
    );
    await client.query('COMMIT');
    return courseId;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function importAcademyCourseIfMissing(
  ownerId: string,
  course: AcademyCourse,
  progress: ProgressInput
): Promise<PersistedAcademyState | null> {
  const existing = await activeCourse(ownerId);
  if (!existing) {
    await createAcademyCourse(ownerId, 'Imported from browser Academy state', course);
    await updateAcademyProgress(ownerId, progress);
  }
  return getAcademyState(ownerId);
}

export async function getAcademyState(ownerId: string): Promise<PersistedAcademyState | null> {
  const courseResult = await getPool().query(
    `SELECT c.id, c.course_data, c.updated_at AS course_updated_at,
            COALESCE(p.active_lesson_index, 0) AS active_lesson_index,
            COALESCE(p.completed_lesson_ids, '[]'::jsonb) AS completed_lesson_ids,
            p.updated_at AS progress_updated_at
     FROM academy_courses c
     LEFT JOIN academy_progress p ON p.course_id = c.id AND p.owner_id = c.owner_id
     WHERE c.owner_id = $1 AND c.status = 'active'
     ORDER BY c.created_at DESC
     LIMIT 1`,
    [ownerId]
  );

  const row = courseResult.rows[0];
  if (!row) return null;

  const courseId = row.id as string;
  const course = asCourse(row.course_data);
  const completed = Array.isArray(row.completed_lesson_ids)
    ? row.completed_lesson_ids.filter((value: unknown): value is string => typeof value === 'string')
    : [];

  const [questionResult, practiceResult] = await Promise.all([
    getPool().query(
      `SELECT lesson_id, question, answer, created_at
       FROM academy_questions
       WHERE course_id = $1 AND owner_id = $2
       ORDER BY created_at ASC`,
      [courseId, ownerId]
    ),
    getPool().query(
      `SELECT DISTINCT ON (lesson_id)
              lesson_id, command, stdout, stderr, exit_code, evaluation, created_at
       FROM academy_practice_attempts
       WHERE course_id = $1 AND owner_id = $2
       ORDER BY lesson_id, created_at DESC`,
      [courseId, ownerId]
    ),
  ]);

  const qa: Record<string, StoredQa[]> = {};
  for (const question of questionResult.rows) {
    const lessonId = question.lesson_id as string;
    (qa[lessonId] ||= []).push({
      question: question.question as string,
      answer: question.answer as AcademyQuestionAnswer,
      createdAt: new Date(question.created_at).toISOString(),
    });
  }

  const practiceResults: Record<string, StoredPracticeResult> = {};
  for (const attempt of practiceResult.rows) {
    practiceResults[attempt.lesson_id as string] = {
      execution: {
        command: attempt.command as string,
        stdout: attempt.stdout as string,
        stderr: attempt.stderr as string,
        exitCode: Number(attempt.exit_code),
      },
      evaluation: attempt.evaluation as AcademyPracticeEvaluation,
      createdAt: new Date(attempt.created_at).toISOString(),
    };
  }

  const updated = row.progress_updated_at || row.course_updated_at;
  return {
    courseId,
    course,
    progress: {
      activeIndex: Number(row.active_lesson_index) || 0,
      completed,
    },
    qa,
    practiceResults,
    updatedAt: new Date(updated).toISOString(),
  };
}

export async function updateAcademyProgress(
  ownerId: string,
  progress: ProgressInput
): Promise<void> {
  const current = await activeCourse(ownerId);
  if (!current) throw new Error('No active Academy course');

  const course = asCourse(current.course_data);
  const validLessonIds = new Set(course.lessons.map((lesson) => lesson.id));
  const completed = Array.from(new Set(progress.completedLessonIds))
    .filter((lessonId) => validLessonIds.has(lessonId));
  const maxIndex = Math.max(0, course.lessons.length - 1);
  const activeIndex = Math.min(Math.max(0, Math.trunc(progress.activeIndex)), maxIndex);

  await getPool().query(
    `INSERT INTO academy_progress (course_id, owner_id, active_lesson_index, completed_lesson_ids, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (course_id) DO UPDATE
       SET active_lesson_index = EXCLUDED.active_lesson_index,
           completed_lesson_ids = EXCLUDED.completed_lesson_ids,
           updated_at = NOW()
     WHERE academy_progress.owner_id = EXCLUDED.owner_id`,
    [current.id, ownerId, activeIndex, JSON.stringify(completed)]
  );

  await getPool().query(
    `UPDATE academy_courses SET updated_at = NOW()
     WHERE id = $1 AND owner_id = $2`,
    [current.id, ownerId]
  );
}

export async function archiveActiveAcademyCourse(ownerId: string): Promise<void> {
  await getPool().query(
    `UPDATE academy_courses
     SET status = 'archived', updated_at = NOW()
     WHERE owner_id = $1 AND status = 'active'`,
    [ownerId]
  );
}

export async function recordAcademyQuestion(args: {
  ownerId: string;
  courseTitle: string;
  lessonTitle: string;
  question: string;
  answer: AcademyQuestionAnswer;
}): Promise<void> {
  const current = await activeCourse(args.ownerId);
  if (!current) return;
  const course = asCourse(current.course_data);
  if (course.title !== args.courseTitle) return;
  const lessonId = lessonIdForTitle(course, args.lessonTitle);
  if (!lessonId) return;

  await getPool().query(
    `INSERT INTO academy_questions (course_id, owner_id, lesson_id, question, answer)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [current.id, args.ownerId, lessonId, args.question, JSON.stringify(args.answer)]
  );
}

export async function recordAcademyPractice(args: {
  ownerId: string;
  courseTitle: string;
  lessonTitle: string;
  labInstanceId?: string | null;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  evaluation: AcademyPracticeEvaluation;
}): Promise<void> {
  const current = await activeCourse(args.ownerId);
  if (!current) return;
  const course = asCourse(current.course_data);
  if (course.title !== args.courseTitle) return;
  const lessonId = lessonIdForTitle(course, args.lessonTitle);
  if (!lessonId) return;

  await getPool().query(
    `INSERT INTO academy_practice_attempts (
       course_id, owner_id, lesson_id, lab_instance_id,
       command, stdout, stderr, exit_code, evaluation
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [
      current.id,
      args.ownerId,
      lessonId,
      args.labInstanceId || null,
      args.command,
      args.stdout,
      args.stderr,
      args.exitCode,
      JSON.stringify(args.evaluation),
    ]
  );
}
