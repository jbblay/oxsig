import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { createAcademyCourse } from '@/lib/academy/persistence';
import { requireAuth } from '@/lib/auth/middleware';
import { recordLearningActivity } from '@/lib/learning/activity';
import {
  buildProgramProcessAcademyCourse,
  PROGRAM_PROCESS_CAPABILITIES,
  PROGRAM_PROCESS_PATH,
  PROGRAM_PROCESS_PATH_ID,
  PROGRAM_PROCESS_PATH_VERSION,
  PROGRAM_PROCESS_SOURCE_PROMPT,
} from '@/lib/learning/program-process-path';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

type EvidenceRow = {
  capability_id: string;
  source_type: 'academy-practice' | 'academy-reflection' | 'assessment';
  result: 'attempted' | 'demonstrated';
  score: number | null;
};

async function loadPathState(ownerId: string) {
  const pool = getPool();
  let enrollment: Record<string, unknown> | null = null;
  let evidenceRows: EvidenceRow[] = [];

  try {
    const enrollmentResult = await pool.query(
      `SELECT id, status, active_capability_id, enrolled_at, last_activity_at, completed_at
         FROM learning_path_enrollments
        WHERE owner_id=$1 AND path_id=$2 AND path_version=$3
        LIMIT 1`,
      [ownerId, PROGRAM_PROCESS_PATH_ID, PROGRAM_PROCESS_PATH_VERSION]
    );
    enrollment = enrollmentResult.rows[0] || null;

    if (enrollment) {
      const evidenceResult = await pool.query(
        `SELECT capability_id, source_type, result, score
           FROM learning_capability_evidence
          WHERE enrollment_id=$1 AND owner_id=$2
          ORDER BY created_at ASC`,
        [enrollment.id, ownerId]
      );
      evidenceRows = evidenceResult.rows as EvidenceRow[];
    }
  } catch (error) {
    // A deployment can briefly precede migration 039. Reading the Dashboard must
    // remain truthful and non-fatal; writes still require the migration.
    if ((error as { code?: string } | null)?.code !== '42P01') throw error;
  }

  const evidenceByCapability = new Map<string, EvidenceRow[]>();
  for (const row of evidenceRows) {
    const current = evidenceByCapability.get(row.capability_id) || [];
    current.push(row);
    evidenceByCapability.set(row.capability_id, current);
  }

  const capabilities = PROGRAM_PROCESS_CAPABILITIES.map((capability, index) => {
    const rows = evidenceByCapability.get(capability.id) || [];
    const practiceDemonstrated = rows.some((row) => row.source_type === 'academy-practice' && row.result === 'demonstrated');
    const reflectionDemonstrated = rows.some((row) => row.source_type === 'academy-reflection' && row.result === 'demonstrated');
    const assessmentDemonstrated = rows.some((row) => row.source_type === 'assessment' && row.result === 'demonstrated');
    const demonstrated = assessmentDemonstrated || (practiceDemonstrated && reflectionDemonstrated);
    const hasEvidence = rows.length > 0;
    const persistedActive = Boolean(enrollment) && String(enrollment?.active_capability_id || '') === capability.id;
    const status = demonstrated ? 'demonstrated' : hasEvidence || persistedActive ? 'in_progress' : 'not_started';
    const reflectionScores = rows
      .filter((row) => row.source_type === 'academy-reflection' && row.score !== null)
      .map((row) => Number(row.score));

    return {
      ...capability,
      evidenceRequirement: capability.evidence,
      order: index + 1,
      status,
      evidence: {
        practiceDemonstrated,
        reflectionDemonstrated,
        assessmentDemonstrated,
        bestReflectionScore: reflectionScores.length ? Math.max(...reflectionScores) : null,
      },
    };
  });

  const demonstratedCount = capabilities.filter((capability) => capability.status === 'demonstrated').length;
  const progressPercent = capabilities.length > 0
    ? Math.round((demonstratedCount / capabilities.length) * 100)
    : 0;
  const recommendedCapabilityId = enrollment
    ? capabilities.find((capability) => capability.status !== 'demonstrated')?.id || null
    : null;

  return {
    path: {
      id: PROGRAM_PROCESS_PATH.id,
      version: PROGRAM_PROCESS_PATH.version,
      title: PROGRAM_PROCESS_PATH.title,
      description: PROGRAM_PROCESS_PATH.description,
    },
    enrollment: enrollment ? {
      id: String(enrollment.id),
      status: String(enrollment.status),
      activeCapabilityId: enrollment.active_capability_id ? String(enrollment.active_capability_id) : null,
      recommendedCapabilityId,
      enrolledAt: new Date(String(enrollment.enrolled_at)).toISOString(),
      lastActivityAt: new Date(String(enrollment.last_activity_at)).toISOString(),
      completedAt: enrollment.completed_at ? new Date(String(enrollment.completed_at)).toISOString() : null,
    } : null,
    demonstratedCount,
    totalCapabilities: capabilities.length,
    progressPercent,
    capabilities,
  };
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;
    const state = await loadPathState(user.id);
    return NextResponse.json({ state }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 8, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const body = await req.json().catch(() => null) as { action?: string } | null;
    if (body?.action !== 'start') {
      return NextResponse.json({ error: 'Invalid reference-path action' }, { status: 400 });
    }

    const pool = getPool();
    const enrollmentResult = await pool.query(
      `INSERT INTO learning_path_enrollments (
         owner_id, path_id, path_version, status, active_capability_id, last_activity_at, updated_at
       ) VALUES ($1,$2,$3,'active',$4,NOW(),NOW())
       ON CONFLICT (owner_id, path_id, path_version)
       DO UPDATE SET
         status='active',
         active_capability_id=COALESCE(learning_path_enrollments.active_capability_id, EXCLUDED.active_capability_id),
         completed_at=NULL,
         last_activity_at=NOW(),
         updated_at=NOW()
       RETURNING id`,
      [user.id, PROGRAM_PROCESS_PATH_ID, PROGRAM_PROCESS_PATH_VERSION, PROGRAM_PROCESS_CAPABILITIES[0].id]
    );

    const activeCourseResult = await pool.query(
      `SELECT source_prompt
         FROM academy_courses
        WHERE owner_id=$1 AND status='active'
        ORDER BY created_at DESC
        LIMIT 1`,
      [user.id]
    );
    const alreadyUsingReferenceCourse = activeCourseResult.rows[0]?.source_prompt === PROGRAM_PROCESS_SOURCE_PROMPT;
    if (!alreadyUsingReferenceCourse) {
      await createAcademyCourse(user.id, PROGRAM_PROCESS_SOURCE_PROMPT, buildProgramProcessAcademyCourse());
    }

    await recordLearningActivity(user.id, 'academy');
    const state = await loadPathState(user.id);
    return NextResponse.json({ state, enrollmentId: enrollmentResult.rows[0]?.id });
  });
}