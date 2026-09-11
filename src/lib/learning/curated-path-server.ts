import 'server-only';

import { createAcademyCourse } from '@/lib/academy/persistence';
import { getPool, transaction } from '@/lib/db/pool';
import { recordLearningActivity } from '@/lib/learning/activity';
import type { CuratedLearningPath } from '@/lib/learning/curated-paths';

type EvidenceRow = {
  capability_id: string;
  source_type: 'academy-practice' | 'academy-reflection' | 'assessment';
  result: 'attempted' | 'demonstrated';
  score: number | null;
};

function replaceNullBytes<T>(value: T): T {
  if (typeof value === 'string') return value.replace(/\u0000/g, '\\0') as T;
  if (Array.isArray(value)) return value.map((item) => replaceNullBytes(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, replaceNullBytes(item)])
    ) as T;
  }
  return value;
}

export async function loadCuratedPathState(ownerId: string, path: CuratedLearningPath) {
  const pool = getPool();
  let enrollment: Record<string, unknown> | null = null;
  let evidenceRows: EvidenceRow[] = [];

  try {
    const enrollmentResult = await pool.query(
      `SELECT id, status, active_capability_id, enrolled_at, last_activity_at, completed_at
         FROM learning_path_enrollments
        WHERE owner_id=$1 AND path_id=$2 AND path_version=$3
        LIMIT 1`,
      [ownerId, path.id, path.version]
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
    // A deployment can briefly precede the capability-path migration. Reads stay
    // truthful and non-fatal while writes continue to require the database contract.
    if ((error as { code?: string } | null)?.code !== '42P01') throw error;
  }

  const evidenceByCapability = new Map<string, EvidenceRow[]>();
  for (const row of evidenceRows) {
    const current = evidenceByCapability.get(row.capability_id) || [];
    current.push(row);
    evidenceByCapability.set(row.capability_id, current);
  }

  const enrollmentActive = Boolean(enrollment) && enrollment?.status === 'active';
  const capabilities = path.capabilities.map((capability, index) => {
    const rows = evidenceByCapability.get(capability.id) || [];
    const practiceDemonstrated = rows.some((row) => row.source_type === 'academy-practice' && row.result === 'demonstrated');
    const reflectionDemonstrated = rows.some((row) => row.source_type === 'academy-reflection' && row.result === 'demonstrated');
    const assessmentDemonstrated = rows.some((row) => row.source_type === 'assessment' && row.result === 'demonstrated');
    const demonstrated = assessmentDemonstrated || (practiceDemonstrated && reflectionDemonstrated);
    const hasEvidence = rows.length > 0;
    const persistedActive = enrollmentActive && String(enrollment?.active_capability_id || '') === capability.id;
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
  const progressPercent = capabilities.length > 0 ? Math.round((demonstratedCount / capabilities.length) * 100) : 0;
  const recommendedCapabilityId = enrollmentActive
    ? capabilities.find((capability) => capability.status !== 'demonstrated')?.id || null
    : null;

  return {
    path: { id: path.id, version: path.version, title: path.title, description: path.description },
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

export async function startCuratedLearningPath(ownerId: string, path: CuratedLearningPath) {
  const pool = getPool();
  const firstCapabilityId = path.capabilities[0]?.id;
  if (!firstCapabilityId) throw new Error(`Curated learning path ${path.id} has no capabilities.`);

  // Academy has one active course. Keep path enrollment aligned with that invariant.
  await pool.query(
    `UPDATE learning_path_enrollments
        SET status='abandoned', active_capability_id=NULL, completed_at=NULL,
            last_activity_at=NOW(), updated_at=NOW()
      WHERE owner_id=$1 AND status='active'
        AND NOT (path_id=$2 AND path_version=$3)`,
    [ownerId, path.id, path.version]
  );

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
    [ownerId, path.id, path.version, firstCapabilityId]
  );

  const activeCourseResult = await pool.query(
    `SELECT source_prompt
       FROM academy_courses
      WHERE owner_id=$1 AND status='active'
      ORDER BY created_at DESC
      LIMIT 1`,
    [ownerId]
  );
  if (activeCourseResult.rows[0]?.source_prompt !== path.sourcePrompt) {
    await createAcademyCourse(ownerId, path.sourcePrompt, replaceNullBytes(path.buildCourse()));
  }

  await recordLearningActivity(ownerId, 'academy');
  return {
    enrollmentId: enrollmentResult.rows[0]?.id as string | undefined,
    state: await loadCuratedPathState(ownerId, path),
  };
}

export async function abandonCuratedLearningPath(ownerId: string, path: CuratedLearningPath) {
  const changed = await transaction(async (client) => {
    const enrollmentResult = await client.query(
      `UPDATE learning_path_enrollments
          SET status='abandoned', active_capability_id=NULL,
              completed_at=NULL, last_activity_at=NOW(), updated_at=NOW()
        WHERE owner_id=$1 AND path_id=$2 AND path_version=$3 AND status='active'
        RETURNING id`,
      [ownerId, path.id, path.version]
    );
    if (!enrollmentResult.rows[0]) return false;

    const courseResult = await client.query(
      `SELECT id
         FROM academy_courses
        WHERE owner_id=$1 AND source_prompt=$2 AND status='active'
        LIMIT 1
        FOR UPDATE`,
      [ownerId, path.sourcePrompt]
    );
    const courseId = courseResult.rows[0]?.id as string | undefined;
    if (courseId) {
      await client.query(
        `UPDATE academy_sessions
            SET status='abandoned', last_activity_at=NOW()
          WHERE owner_id=$1 AND course_id=$2 AND status='active'`,
        [ownerId, courseId]
      );
      await client.query(
        `UPDATE academy_courses SET status='archived', updated_at=NOW() WHERE id=$1 AND owner_id=$2`,
        [courseId, ownerId]
      );
    }
    return true;
  });

  return { changed, state: await loadCuratedPathState(ownerId, path) };
}
