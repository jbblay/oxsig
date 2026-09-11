import 'server-only';

import { getPool } from '@/lib/db/pool';
import {
  getCuratedLearningPathBySourcePrompt,
  type CuratedLearningPath,
} from '@/lib/learning/curated-paths';
import {
  computeCuratedProgress,
  type CuratedProgressEvidence,
} from '@/lib/learning/curated-progression-model';

export type ReconciledCuratedProgress = {
  pathId: string;
  pathVersion: number;
  demonstratedCapabilityIds: string[];
  nextCapabilityId: string | null;
  completed: boolean;
};

export async function reconcileCuratedPathEnrollment(
  ownerId: string,
  path: CuratedLearningPath,
): Promise<ReconciledCuratedProgress | null> {
  const pool = getPool();
  const enrollmentResult = await pool.query(
    `SELECT id
       FROM learning_path_enrollments
      WHERE owner_id=$1 AND path_id=$2 AND path_version=$3 AND status='active'
      LIMIT 1`,
    [ownerId, path.id, path.version],
  );
  const enrollmentId = enrollmentResult.rows[0]?.id as string | undefined;
  if (!enrollmentId) return null;

  const evidenceResult = await pool.query(
    `SELECT capability_id,source_type,result
       FROM learning_capability_evidence
      WHERE enrollment_id=$1 AND owner_id=$2`,
    [enrollmentId, ownerId],
  );
  const evidence: CuratedProgressEvidence[] = evidenceResult.rows.map((row) => ({
    capabilityId: String(row.capability_id),
    sourceType: row.source_type as CuratedProgressEvidence['sourceType'],
    result: row.result as CuratedProgressEvidence['result'],
  }));
  const progress = computeCuratedProgress(
    path.capabilities.map((capability) => capability.id),
    evidence,
  );

  if (progress.completed) {
    await pool.query(
      `UPDATE learning_path_enrollments
          SET status='completed', active_capability_id=NULL,
              completed_at=COALESCE(completed_at,NOW()),
              last_activity_at=NOW(), updated_at=NOW()
        WHERE id=$1 AND owner_id=$2 AND status='active'`,
      [enrollmentId, ownerId],
    );
  } else {
    await pool.query(
      `UPDATE learning_path_enrollments
          SET active_capability_id=$1, completed_at=NULL,
              last_activity_at=NOW(), updated_at=NOW()
        WHERE id=$2 AND owner_id=$3 AND status='active'`,
      [progress.nextCapabilityId, enrollmentId, ownerId],
    );
  }

  return {
    pathId: path.id,
    pathVersion: path.version,
    ...progress,
  };
}

export async function reconcileActiveCuratedPath(ownerId: string) {
  const courseResult = await getPool().query(
    `SELECT source_prompt
       FROM academy_courses
      WHERE owner_id=$1 AND status='active'
      ORDER BY created_at DESC
      LIMIT 1`,
    [ownerId],
  );
  const sourcePrompt = courseResult.rows[0]?.source_prompt as string | undefined;
  if (!sourcePrompt) return null;
  const path = getCuratedLearningPathBySourcePrompt(sourcePrompt);
  if (!path) return null;
  return reconcileCuratedPathEnrollment(ownerId, path);
}
