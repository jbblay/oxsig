import 'server-only';

import type { Pool, PoolClient } from 'pg';
import { getPool, transaction } from '@/lib/db/pool';
import type {
  AcademyCourse,
  AcademyLearningReflection,
  AcademyLesson,
  AcademyPractice,
  AcademyReflectionEvaluation,
  AcademyUnderstandingSummary,
} from './types';

const EVALUATION_CLAIM_STALE_MS = 5 * 60 * 1000;

type PracticeLesson = AcademyLesson & { practice: AcademyPractice };

export class AcademyReflectionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 409
  ) {
    super(message);
    this.name = 'AcademyReflectionError';
  }
}

type ReflectionRow = {
  id: string;
  course_id: string;
  owner_id: string;
  lesson_id: string;
  command: string;
  prediction: string;
  evidence_id: string | null;
  explanation: string | null;
  evaluation: AcademyReflectionEvaluation | null;
  explanation_score: number | null;
  model: string | null;
  status: 'predicted' | 'evaluating' | 'reflected';
  evidence_bound_at: Date | string | null;
  evaluation_started_at: Date | string | null;
  reflected_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function asCourse(value: unknown): AcademyCourse {
  return value as AcademyCourse;
}

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function mapReflection(row: ReflectionRow): AcademyLearningReflection {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    command: row.command,
    prediction: row.prediction,
    evidenceId: row.evidence_id,
    explanation: row.explanation,
    evaluation: row.evaluation,
    explanationScore: row.explanation_score === null ? null : Number(row.explanation_score),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    reflectedAt: iso(row.reflected_at),
  };
}

function requiredPracticeCount(course: AcademyCourse) {
  return course.lessons.filter((lesson) => lesson.practice !== null).length;
}

async function activeCourseForOwner(ownerId: string) {
  const result = await getPool().query(
    `SELECT id, course_data
       FROM academy_courses
      WHERE owner_id=$1 AND status='active'
      ORDER BY created_at DESC
      LIMIT 1`,
    [ownerId]
  );
  return result.rows[0] || null;
}

function resolvePractice(course: AcademyCourse, courseTitle: string, lessonTitle: string): PracticeLesson {
  if (course.title !== courseTitle) {
    throw new AcademyReflectionError('The active Academy course changed before this prediction was saved.', 'COURSE_CHANGED');
  }
  const lesson = course.lessons.find((item) => item.title === lessonTitle);
  if (!lesson) {
    throw new AcademyReflectionError('The Academy lesson is no longer part of the active course.', 'LESSON_NOT_FOUND', 404);
  }
  if (!lesson.practice) {
    throw new AcademyReflectionError('This Academy lesson has no practical execution to predict.', 'PRACTICE_NOT_FOUND');
  }
  return lesson as PracticeLesson;
}

export async function createAcademyPrediction(input: {
  ownerId: string;
  courseTitle: string;
  lessonTitle: string;
  prediction: string;
}): Promise<AcademyLearningReflection> {
  const current = await activeCourseForOwner(input.ownerId);
  if (!current) {
    throw new AcademyReflectionError('No active Academy course is available for this prediction.', 'COURSE_NOT_FOUND', 404);
  }
  const course = asCourse(current.course_data);
  const lesson = resolvePractice(course, input.courseTitle, input.lessonTitle);
  const prediction = input.prediction.trim();

  const result = await getPool().query(
    `INSERT INTO academy_learning_reflections (
       course_id, owner_id, lesson_id, command, prediction, status, updated_at
     ) VALUES ($1,$2,$3,$4,$5,'predicted',NOW())
     ON CONFLICT (course_id, owner_id, lesson_id) WHERE status IN ('predicted','evaluating')
     DO UPDATE SET
       command=EXCLUDED.command,
       prediction=EXCLUDED.prediction,
       status='predicted',
       evidence_id=NULL,
       explanation=NULL,
       evaluation=NULL,
       explanation_score=NULL,
       model=NULL,
       evidence_bound_at=NULL,
       evaluation_started_at=NULL,
       reflected_at=NULL,
       created_at=NOW(),
       updated_at=NOW()
     WHERE academy_learning_reflections.owner_id=EXCLUDED.owner_id
       AND academy_learning_reflections.status='predicted'
     RETURNING *`,
    [current.id, input.ownerId, lesson.id, lesson.practice.command, prediction]
  );

  const row = result.rows[0] as ReflectionRow | undefined;
  if (!row) {
    throw new AcademyReflectionError(
      'This prediction is already being evaluated. Finish or retry that reflection before replacing it.',
      'REFLECTION_EVALUATING'
    );
  }
  return mapReflection(row);
}

export type AcademyReflectionClaim = {
  reflection: AcademyLearningReflection;
  course: AcademyCourse;
  lessonTitle: string;
  instruction: string;
  expected: string;
  evidence: {
    id: string;
    labInstanceId: string | null;
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    practiceEvaluation: Record<string, unknown>;
  };
};

export async function claimAcademyReflection(input: {
  ownerId: string;
  reflectionId: string;
  evidenceId: string;
  explanation: string;
}): Promise<{ claim?: AcademyReflectionClaim; existing?: AcademyLearningReflection }> {
  return transaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM academy_learning_reflections WHERE id=$1 AND owner_id=$2 FOR UPDATE`,
      [input.reflectionId, input.ownerId]
    );
    let row = locked.rows[0] as ReflectionRow | undefined;
    if (!row) {
      throw new AcademyReflectionError('The Academy prediction was not found.', 'REFLECTION_NOT_FOUND', 404);
    }

    if (row.status === 'reflected') {
      if (row.evidence_id !== input.evidenceId) {
        throw new AcademyReflectionError('This prediction was already bound to different execution evidence.', 'REFLECTION_ALREADY_BOUND');
      }
      return { existing: mapReflection(row) };
    }

    if (row.status === 'evaluating') {
      const started = row.evaluation_started_at ? new Date(row.evaluation_started_at).getTime() : 0;
      if (started && Date.now() - started <= EVALUATION_CLAIM_STALE_MS) {
        throw new AcademyReflectionError('This learner explanation is already being evaluated.', 'REFLECTION_EVALUATING');
      }
      const recovered = await client.query(
        `UPDATE academy_learning_reflections
            SET status='predicted', evidence_id=NULL, explanation=NULL,
                evidence_bound_at=NULL, evaluation_started_at=NULL, updated_at=NOW()
          WHERE id=$1 AND owner_id=$2 AND status='evaluating'
          RETURNING *`,
        [row.id, input.ownerId]
      );
      row = recovered.rows[0] as ReflectionRow | undefined;
      if (!row) {
        throw new AcademyReflectionError('The stale reflection claim could not be recovered.', 'REFLECTION_CLAIM_CONFLICT');
      }
    }

    const courseResult = await client.query(
      `SELECT course_data
         FROM academy_courses
        WHERE id=$1 AND owner_id=$2 AND status='active'
        LIMIT 1`,
      [row.course_id, input.ownerId]
    );
    if (!courseResult.rows[0]) {
      throw new AcademyReflectionError('The Academy course changed before this reflection was completed.', 'COURSE_CHANGED');
    }
    const course = asCourse(courseResult.rows[0].course_data);
    const lesson = course.lessons.find((item) => item.id === row.lesson_id);
    if (!lesson?.practice || lesson.practice.command !== row.command) {
      throw new AcademyReflectionError('The practical lesson changed after the prediction was captured.', 'PRACTICE_CHANGED');
    }

    const evidenceResult = await client.query(
      `SELECT id, lab_instance_id, command, stdout, stderr, exit_code,
              state, analysis_kind, analysis, created_at, execution_started_at
         FROM execution_evidence
        WHERE id=$1
          AND owner_id=$2
          AND source='interactive-terminal'
          AND surface='academy'
          AND provenance='browser-observed'
          AND state='analyzed'
          AND analysis_kind='academy'
        FOR SHARE`,
      [input.evidenceId, input.ownerId]
    );
    const evidence = evidenceResult.rows[0];
    if (!evidence) {
      throw new AcademyReflectionError(
        'The exact Academy execution evidence is not ready for learner reflection.',
        'EVIDENCE_NOT_READY'
      );
    }
    if (String(evidence.command || '') !== row.command) {
      throw new AcademyReflectionError('The execution evidence does not match the predicted command.', 'EVIDENCE_COMMAND_MISMATCH');
    }

    const predictionTime = new Date(row.created_at).getTime();
    const evidenceCreatedTime = new Date(evidence.created_at).getTime();
    const executionStartedTime = evidence.execution_started_at ? new Date(evidence.execution_started_at).getTime() : NaN;
    if (
      !Number.isFinite(predictionTime) ||
      !Number.isFinite(evidenceCreatedTime) ||
      !Number.isFinite(executionStartedTime) ||
      evidenceCreatedTime < predictionTime ||
      executionStartedTime < predictionTime
    ) {
      throw new AcademyReflectionError(
        'This execution started before the learner prediction was durably captured.',
        'PREDICTION_NOT_BEFORE_EXECUTION'
      );
    }

    const alreadyBound = await client.query(
      `SELECT id
         FROM academy_learning_reflections
        WHERE owner_id=$1 AND evidence_id=$2 AND id<>$3
        LIMIT 1`,
      [input.ownerId, input.evidenceId, row.id]
    );
    if (alreadyBound.rows[0]) {
      throw new AcademyReflectionError('This execution evidence is already bound to another learner reflection.', 'EVIDENCE_ALREADY_REFLECTED');
    }

    const explanation = input.explanation.trim();
    const claimed = await client.query(
      `UPDATE academy_learning_reflections
          SET status='evaluating',
              evidence_id=$1,
              explanation=$2,
              evidence_bound_at=NOW(),
              evaluation_started_at=NOW(),
              updated_at=NOW()
        WHERE id=$3 AND owner_id=$4 AND status='predicted'
        RETURNING *`,
      [input.evidenceId, explanation, row.id, input.ownerId]
    );
    const claimedRow = claimed.rows[0] as ReflectionRow | undefined;
    if (!claimedRow) {
      throw new AcademyReflectionError('The learner reflection was claimed by another request.', 'REFLECTION_CLAIM_CONFLICT');
    }

    return {
      claim: {
        reflection: mapReflection(claimedRow),
        course,
        lessonTitle: lesson.title,
        instruction: lesson.practice.instruction,
        expected: lesson.practice.expected,
        evidence: {
          id: String(evidence.id),
          labInstanceId: evidence.lab_instance_id ? String(evidence.lab_instance_id) : null,
          command: String(evidence.command),
          stdout: String(evidence.stdout || ''),
          stderr: String(evidence.stderr || ''),
          exitCode: Number(evidence.exit_code ?? -1),
          practiceEvaluation: (evidence.analysis || {}) as Record<string, unknown>,
        },
      },
    };
  });
}

async function understandingSummary(client: Pool | PoolClient, args: {
  ownerId: string;
  courseId: string;
  course: AcademyCourse;
}): Promise<AcademyUnderstandingSummary> {
  const requiredPractices = requiredPracticeCount(args.course);
  const result = await client.query(
    `SELECT COUNT(*)::int AS reflected,
            COALESCE(AVG(explanation_score), 0)::float AS average_score
       FROM (
         SELECT DISTINCT ON (lesson_id) lesson_id, explanation_score
           FROM academy_learning_reflections
          WHERE course_id=$1 AND owner_id=$2 AND status='reflected'
          ORDER BY lesson_id, reflected_at DESC NULLS LAST, created_at DESC
       ) latest`,
    [args.courseId, args.ownerId]
  );
  const reflectedPractices = Math.min(requiredPractices, Number(result.rows[0]?.reflected) || 0);
  const averageReflectionScore = Math.max(0, Math.min(100, Math.round(Number(result.rows[0]?.average_score) || 0)));
  const coverage = requiredPractices > 0 ? reflectedPractices / requiredPractices : 0;
  const score = Math.max(0, Math.min(100, Math.round(averageReflectionScore * coverage)));
  const status: AcademyUnderstandingSummary['status'] = reflectedPractices === 0
    ? 'not_started'
    : reflectedPractices >= requiredPractices && requiredPractices > 0 && averageReflectionScore >= 70
      ? 'demonstrated'
      : 'developing';

  await client.query(
    `UPDATE academy_mastery
        SET reflected_practices=$1,
            understanding_score=$2,
            understanding_status=$3,
            updated_at=NOW()
      WHERE course_id=$4 AND owner_id=$5`,
    [reflectedPractices, score, status, args.courseId, args.ownerId]
  );

  return { reflectedPractices, requiredPractices, averageReflectionScore, score, status };
}

export async function completeAcademyReflection(input: {
  ownerId: string;
  reflectionId: string;
  evidenceId: string;
  evaluation: AcademyReflectionEvaluation;
  model: string;
}): Promise<{ reflection: AcademyLearningReflection; understanding: AcademyUnderstandingSummary }> {
  return transaction(async (client) => {
    const locked = await client.query(
      `SELECT r.*, c.course_data
         FROM academy_learning_reflections r
         JOIN academy_courses c ON c.id=r.course_id AND c.owner_id=r.owner_id
        WHERE r.id=$1 AND r.owner_id=$2
        FOR UPDATE OF r`,
      [input.reflectionId, input.ownerId]
    );
    const row = locked.rows[0] as (ReflectionRow & { course_data: unknown }) | undefined;
    if (!row) {
      throw new AcademyReflectionError('The Academy reflection was not found.', 'REFLECTION_NOT_FOUND', 404);
    }
    const course = asCourse(row.course_data);

    if (row.status === 'reflected') {
      const understanding = await understandingSummary(client, {
        ownerId: input.ownerId,
        courseId: row.course_id,
        course,
      });
      return { reflection: mapReflection(row), understanding };
    }
    if (row.status !== 'evaluating' || row.evidence_id !== input.evidenceId) {
      throw new AcademyReflectionError('The learner explanation no longer owns this evaluation claim.', 'REFLECTION_CLAIM_CONFLICT');
    }

    const score = Math.max(0, Math.min(100, Math.round(input.evaluation.score)));
    const evaluation = { ...input.evaluation, score };
    const updated = await client.query(
      `UPDATE academy_learning_reflections
          SET status='reflected',
              evaluation=$1::jsonb,
              explanation_score=$2,
              model=$3,
              reflected_at=NOW(),
              updated_at=NOW()
        WHERE id=$4 AND owner_id=$5 AND evidence_id=$6 AND status='evaluating'
        RETURNING *`,
      [JSON.stringify(evaluation), score, input.model, row.id, input.ownerId, input.evidenceId]
    );
    const reflected = updated.rows[0] as ReflectionRow | undefined;
    if (!reflected) {
      throw new AcademyReflectionError('The learner reflection could not be finalized.', 'REFLECTION_CLAIM_CONFLICT');
    }

    const understanding = await understandingSummary(client, {
      ownerId: input.ownerId,
      courseId: row.course_id,
      course,
    });
    return { reflection: mapReflection(reflected), understanding };
  });
}

export async function releaseAcademyReflectionClaim(input: {
  ownerId: string;
  reflectionId: string;
  evidenceId: string;
}) {
  await getPool().query(
    `UPDATE academy_learning_reflections
        SET status='predicted',
            evidence_id=NULL,
            explanation=NULL,
            evidence_bound_at=NULL,
            evaluation_started_at=NULL,
            updated_at=NOW()
      WHERE id=$1 AND owner_id=$2 AND evidence_id=$3 AND status='evaluating'`,
    [input.reflectionId, input.ownerId, input.evidenceId]
  );
}

export async function getAcademyUnderstanding(ownerId: string, courseId: string): Promise<AcademyUnderstandingSummary> {
  const courseResult = await getPool().query(
    `SELECT course_data FROM academy_courses WHERE id=$1 AND owner_id=$2 LIMIT 1`,
    [courseId, ownerId]
  );
  if (!courseResult.rows[0]) {
    throw new AcademyReflectionError('Academy course not found.', 'COURSE_NOT_FOUND', 404);
  }
  return understandingSummary(getPool(), {
    ownerId,
    courseId,
    course: asCourse(courseResult.rows[0].course_data),
  });
}

export async function getAcademyUnderstandingForReflection(
  ownerId: string,
  reflectionId: string
): Promise<AcademyUnderstandingSummary> {
  const result = await getPool().query(
    `SELECT r.course_id, c.course_data
       FROM academy_learning_reflections r
       JOIN academy_courses c ON c.id=r.course_id AND c.owner_id=r.owner_id
      WHERE r.id=$1 AND r.owner_id=$2
      LIMIT 1`,
    [reflectionId, ownerId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AcademyReflectionError('Academy reflection not found.', 'REFLECTION_NOT_FOUND', 404);
  }
  return understandingSummary(getPool(), {
    ownerId,
    courseId: String(row.course_id),
    course: asCourse(row.course_data),
  });
}
