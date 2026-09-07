import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { recordLearningActivity } from '@/lib/learning/activity';
import {
  isProgramProcessCapabilityId,
  PROGRAM_PROCESS_PATH_ID,
  PROGRAM_PROCESS_PATH_VERSION,
  PROGRAM_PROCESS_SOURCE_PROMPT,
} from '@/lib/learning/program-process-path';
import { evaluateProgramProcessAssessment } from '@/lib/learning/program-process-assessment';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const requestSchema = z.object({
  capabilityId: z.string().trim().min(1).max(96),
  explanation: z.string().trim().min(20).max(5000),
}).strict();

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 8, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success || !isProgramProcessCapabilityId(parsed.data?.capabilityId || '')) {
      return NextResponse.json({ error: 'Invalid capability assessment request' }, { status: 400 });
    }

    const pool = getPool();
    const enrollmentResult = await pool.query(
      `SELECT id
         FROM learning_path_enrollments
        WHERE owner_id=$1 AND path_id=$2 AND path_version=$3 AND status='active'
        LIMIT 1`,
      [user.id, PROGRAM_PROCESS_PATH_ID, PROGRAM_PROCESS_PATH_VERSION]
    );
    const enrollmentId = enrollmentResult.rows[0]?.id as string | undefined;
    if (!enrollmentId) {
      return NextResponse.json(
        { error: 'Start the reference learning journey before taking a capability assessment', code: 'ENROLLMENT_REQUIRED' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const practiceResult = await pool.query(
      `SELECT attempt.id, attempt.command, attempt.stdout, attempt.stderr, attempt.exit_code, attempt.evaluation
         FROM academy_practice_attempts attempt
         JOIN academy_courses course
           ON course.id=attempt.course_id
          AND course.owner_id=attempt.owner_id
        WHERE attempt.owner_id=$1
          AND attempt.lesson_id=$2
          AND course.source_prompt=$3
          AND attempt.evaluation->>'status'='passed'
        ORDER BY attempt.created_at DESC
        LIMIT 1`,
      [user.id, parsed.data.capabilityId, PROGRAM_PROCESS_SOURCE_PROMPT]
    );
    const practice = practiceResult.rows[0];
    if (!practice) {
      return NextResponse.json(
        {
          error: 'Prove what you know requires a passed practical checkpoint for this capability first.',
          code: 'PRACTICE_REQUIRED',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    try {
      const evaluation = await evaluateProgramProcessAssessment({
        capabilityId: parsed.data.capabilityId,
        explanation: parsed.data.explanation,
        practice: {
          command: String(practice.command),
          stdout: String(practice.stdout || ''),
          stderr: String(practice.stderr || ''),
          exitCode: Number(practice.exit_code),
          evaluation: practice.evaluation || {},
        },
      });
      const demonstrated = evaluation.status === 'demonstrated' && evaluation.score >= 85;

      await pool.query(
        `INSERT INTO learning_capability_evidence (
           enrollment_id, owner_id, capability_id, source_type, source_id,
           result, score, evidence, demonstrated_at, updated_at
         ) VALUES ($1,$2,$3,'assessment',$4,$5,$6,$7::jsonb,$8,NOW())
         ON CONFLICT (owner_id, capability_id, source_type, source_id)
         DO UPDATE SET
           result=EXCLUDED.result,
           score=EXCLUDED.score,
           evidence=EXCLUDED.evidence,
           demonstrated_at=EXCLUDED.demonstrated_at,
           updated_at=NOW()`,
        [
          enrollmentId,
          user.id,
          parsed.data.capabilityId,
          practice.id,
          demonstrated ? 'demonstrated' : 'attempted',
          evaluation.score,
          JSON.stringify({
            practiceAttemptId: practice.id,
            feedback: evaluation.feedback,
            evidenceConnection: evaluation.evidenceConnection,
            misconceptions: evaluation.misconceptions,
          }),
          demonstrated ? new Date() : null,
        ]
      );

      await pool.query(
        `UPDATE learning_path_enrollments
            SET active_capability_id=$1, last_activity_at=NOW(), updated_at=NOW()
          WHERE id=$2 AND owner_id=$3`,
        [parsed.data.capabilityId, enrollmentId, user.id]
      );
      await recordLearningActivity(user.id, 'academy');

      return NextResponse.json(
        {
          assessment: {
            capabilityId: parsed.data.capabilityId,
            result: demonstrated ? 'demonstrated' : 'attempted',
            ...evaluation,
          },
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      console.error('Program-to-process capability assessment failed:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message.slice(0, 500) : 'Capability assessment failed' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  });
}
