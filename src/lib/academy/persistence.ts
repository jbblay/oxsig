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
  session: {
    id: string;
    status: 'active' | 'completed' | 'abandoned';
    startedAt: string;
    lastActivityAt: string;
    completedAt: string | null;
  } | null;
  mastery: {
    completedLessons: number;
    totalLessons: number;
    passedPractices: number;
    requiredPractices: number;
    score: number;
    status: 'in_progress' | 'mastered';
    updatedAt: string;
  };
  updatedAt: string;
};

export type AcademyCourseHistoryItem = {
  courseId: string;
  title: string;
  topic: string;
  level: AcademyCourse['level'];
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

function asCourse(value: unknown): AcademyCourse {
  return value as AcademyCourse;
}

function lessonIdForTitle(course: AcademyCourse, lessonTitle: string): string | null {
  return course.lessons.find((lesson) => lesson.title === lessonTitle)?.id || null;
}

function completedLessonIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item: unknown): item is string => typeof item === 'string')
    : [];
}

function requiredPracticeCount(course: AcademyCourse): number {
  return course.lessons.filter((lesson) => lesson.practice !== null).length;
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

async function touchAcademySession(ownerId: string, courseId: string): Promise<void> {
  await getPool().query(
    `UPDATE academy_sessions
     SET last_activity_at = NOW()
     WHERE owner_id = $1 AND course_id = $2 AND status = 'active'`,
    [ownerId, courseId]
  );
}

async function refreshAcademyMastery(
  ownerId: string,
  courseId: string,
  course: AcademyCourse,
  completed: string[]
): Promise<void> {
  const validLessonIds = new Set(course.lessons.map((lesson) => lesson.id));
  const completedCount = Array.from(new Set(completed)).filter((id) => validLessonIds.has(id)).length;
  const totalLessons = course.lessons.length;
  const requiredPractices = requiredPracticeCount(course);

  const passedResult = await getPool().query(
    `SELECT COUNT(DISTINCT lesson_id)::int AS passed
     FROM academy_practice_attempts
     WHERE course_id = $1
       AND owner_id = $2
       AND evaluation->>'status' = 'passed'`,
    [courseId, ownerId]
  );
  const passedPractices = Math.min(requiredPractices, Number(passedResult.rows[0]?.passed) || 0);

  const lessonRatio = totalLessons > 0 ? completedCount / totalLessons : 0;
  const practiceRatio = requiredPractices > 0 ? passedPractices / requiredPractices : 1;
  const score = Math.max(0, Math.min(100, Math.round((lessonRatio * 70) + (practiceRatio * 30))));
  const mastered = completedCount >= totalLessons && passedPractices >= requiredPractices;

  await getPool().query(
    `INSERT INTO academy_mastery (
       course_id, owner_id, completed_lessons, total_lessons,
       passed_practices, required_practices, score, status, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (course_id) DO UPDATE
       SET completed_lessons = EXCLUDED.completed_lessons,
           total_lessons = EXCLUDED.total_lessons,
           passed_practices = EXCLUDED.passed_practices,
           required_practices = EXCLUDED.required_practices,
           score = EXCLUDED.score,
           status = EXCLUDED.status,
           updated_at = NOW()
     WHERE academy_mastery.owner_id = EXCLUDED.owner_id`,
    [
      courseId,
      ownerId,
      completedCount,
      totalLessons,
      passedPractices,
      requiredPractices,
      score,
      mastered ? 'mastered' : 'in_progress',
    ]
  );

  if (mastered) {
    await getPool().query(
      `UPDATE academy_sessions
       SET status = 'completed', last_activity_at = NOW(), completed_at = COALESCE(completed_at, NOW())
       WHERE owner_id = $1 AND course_id = $2 AND status = 'active'`,
      [ownerId, courseId]
    );
  } else {
    await getPool().query(
      `INSERT INTO academy_sessions (course_id, owner_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT DO NOTHING`,
      [courseId, ownerId]
    );
    await touchAcademySession(ownerId, courseId);
  }
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
      `UPDATE academy_sessions s
       SET status = 'abandoned', last_activity_at = NOW()
       WHERE s.owner_id = $1
         AND s.status = 'active'
         AND EXISTS (
           SELECT 1 FROM academy_courses c
           WHERE c.id = s.course_id AND c.owner_id = $1 AND c.status = 'active'
         )`,
      [ownerId]
    );
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
    await client.query(
      `INSERT INTO academy_sessions (course_id, owner_id, status)
       VALUES ($1, $2, 'active')`,
      [courseId, ownerId]
    );
    await client.query(
      `INSERT INTO academy_mastery (
         course_id, owner_id, completed_lessons, total_lessons,
         passed_practices, required_practices, score, status
       ) VALUES ($1,$2,0,$3,0,$4,$5,'in_progress')`,
      [
        courseId,
        ownerId,
        course.lessons.length,
        requiredPracticeCount(course),
        requiredPracticeCount(course) === 0 ? 30 : 0,
      ]
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
  const completed = completedLessonIds(row.completed_lesson_ids);

  await refreshAcademyMastery(ownerId, courseId, course, completed);

  const [questionResult, practiceResult, sessionResult, masteryResult] = await Promise.all([
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
    getPool().query(
      `SELECT id, status, started_at, last_activity_at, completed_at
       FROM academy_sessions
       WHERE course_id = $1 AND owner_id = $2
       ORDER BY started_at DESC
       LIMIT 1`,
      [courseId, ownerId]
    ),
    getPool().query(
      `SELECT completed_lessons, total_lessons, passed_practices,
              required_practices, score, status, updated_at
       FROM academy_mastery
       WHERE course_id = $1 AND owner_id = $2`,
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

  const sessionRow = sessionResult.rows[0];
  const masteryRow = masteryResult.rows[0];
  const updated = masteryRow?.updated_at || row.progress_updated_at || row.course_updated_at;

  return {
    courseId,
    course,
    progress: {
      activeIndex: Number(row.active_lesson_index) || 0,
      completed,
    },
    qa,
    practiceResults,
    session: sessionRow ? {
      id: sessionRow.id as string,
      status: sessionRow.status as 'active' | 'completed' | 'abandoned',
      startedAt: new Date(sessionRow.started_at).toISOString(),
      lastActivityAt: new Date(sessionRow.last_activity_at).toISOString(),
      completedAt: sessionRow.completed_at ? new Date(sessionRow.completed_at).toISOString() : null,
    } : null,
    mastery: {
      completedLessons: Number(masteryRow?.completed_lessons) || 0,
      totalLessons: Number(masteryRow?.total_lessons) || course.lessons.length,
      passedPractices: Number(masteryRow?.passed_practices) || 0,
      requiredPractices: Number(masteryRow?.required_practices) || requiredPracticeCount(course),
      score: Number(masteryRow?.score) || 0,
      status: (masteryRow?.status || 'in_progress') as 'in_progress' | 'mastered',
      updatedAt: new Date(updated).toISOString(),
    },
    updatedAt: new Date(updated).toISOString(),
  };
}

export async function listAcademyCourseHistory(
  ownerId: string,
  limit = 20
): Promise<AcademyCourseHistoryItem[]> {
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(limit)));
  const result = await getPool().query(
    `SELECT c.id, c.course_data, c.status AS course_status, c.created_at, c.updated_at,
            COALESCE(p.active_lesson_index, 0) AS active_lesson_index,
            COALESCE(m.completed_lessons, 0) AS completed_lessons,
            COALESCE(m.total_lessons, jsonb_array_length(c.course_data->'lessons')) AS total_lessons,
            COALESCE(m.score, 0) AS mastery_score,
            COALESCE(m.status, 'in_progress') AS mastery_status,
            s.status AS session_status
     FROM academy_courses c
     LEFT JOIN academy_progress p ON p.course_id = c.id AND p.owner_id = c.owner_id
     LEFT JOIN academy_mastery m ON m.course_id = c.id AND m.owner_id = c.owner_id
     LEFT JOIN LATERAL (
       SELECT status
       FROM academy_sessions
       WHERE course_id = c.id AND owner_id = c.owner_id
       ORDER BY started_at DESC
       LIMIT 1
     ) s ON true
     WHERE c.owner_id = $1
     ORDER BY c.updated_at DESC, c.created_at DESC
     LIMIT $2`,
    [ownerId, safeLimit]
  );

  return result.rows.map((row) => {
    const course = asCourse(row.course_data);
    return {
      courseId: row.id as string,
      title: course.title,
      topic: course.topic,
      level: course.level,
      courseStatus: row.course_status as 'active' | 'archived',
      activeIndex: Number(row.active_lesson_index) || 0,
      completedLessons: Number(row.completed_lessons) || 0,
      totalLessons: Number(row.total_lessons) || course.lessons.length,
      masteryScore: Number(row.mastery_score) || 0,
      masteryStatus: row.mastery_status as 'in_progress' | 'mastered',
      sessionStatus: row.session_status
        ? row.session_status as 'active' | 'completed' | 'abandoned'
        : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });
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

  await refreshAcademyMastery(ownerId, current.id as string, course, completed);
}

export async function archiveActiveAcademyCourse(ownerId: string): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE academy_sessions s
       SET status = 'abandoned', last_activity_at = NOW()
       WHERE s.owner_id = $1
         AND s.status = 'active'
         AND EXISTS (
           SELECT 1 FROM academy_courses c
           WHERE c.id = s.course_id AND c.owner_id = $1 AND c.status = 'active'
         )`,
      [ownerId]
    );
    await client.query(
      `UPDATE academy_courses
       SET status = 'archived', updated_at = NOW()
       WHERE owner_id = $1 AND status = 'active'`,
      [ownerId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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
  await touchAcademySession(args.ownerId, current.id as string);
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

  const progressResult = await getPool().query(
    `SELECT completed_lesson_ids
     FROM academy_progress
     WHERE course_id = $1 AND owner_id = $2`,
    [current.id, args.ownerId]
  );
  await refreshAcademyMastery(
    args.ownerId,
    current.id as string,
    course,
    completedLessonIds(progressResult.rows[0]?.completed_lesson_ids)
  );
}
