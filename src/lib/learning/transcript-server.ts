import 'server-only';

import { getPool } from '@/lib/db/pool';
import { CURATED_LEARNING_PATHS } from '@/lib/learning/curated-paths';
import {
  buildProvedSkillTranscript,
  type TranscriptEvidenceRow,
} from '@/lib/learning/transcript-model';

export async function loadProvedSkillTranscript(ownerId: string) {
  const result = await getPool().query(
    `SELECT enrollment.path_id,
            enrollment.path_version,
            enrollment.status AS enrollment_status,
            evidence.capability_id,
            evidence.source_type,
            evidence.source_id,
            evidence.result,
            evidence.score,
            evidence.demonstrated_at,
            evidence.created_at
       FROM learning_capability_evidence evidence
       JOIN learning_path_enrollments enrollment
         ON enrollment.id = evidence.enrollment_id
        AND enrollment.owner_id = evidence.owner_id
      WHERE evidence.owner_id = $1
      ORDER BY evidence.created_at ASC`,
    [ownerId],
  );

  const rows: TranscriptEvidenceRow[] = result.rows.map((row) => ({
    pathId: String(row.path_id),
    pathVersion: Number(row.path_version),
    enrollmentStatus: row.enrollment_status as TranscriptEvidenceRow['enrollmentStatus'],
    capabilityId: String(row.capability_id),
    sourceType: row.source_type as TranscriptEvidenceRow['sourceType'],
    sourceId: String(row.source_id),
    result: row.result as TranscriptEvidenceRow['result'],
    score: row.score === null ? null : Number(row.score),
    demonstratedAt: row.demonstrated_at ? new Date(row.demonstrated_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  }));

  return buildProvedSkillTranscript(rows, CURATED_LEARNING_PATHS);
}
