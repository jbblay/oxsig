import 'server-only';
import { getPool, transaction } from '@/lib/db/pool';
import {
  DOCKER_SIMULATION_STAGES,
  SIMULATION_SKILL,
  SIMULATOR_VERSION,
  SIMULATION_SP_PER_STAGE,
  simulationStage,
  stageIsUnlocked,
  type DockerSimulationStageId,
} from './simulation-policy';

export class SimulationError extends Error {
  constructor(message: string, readonly code: string, readonly status = 409) {
    super(message);
    this.name = 'SimulationError';
  }
}

type SimulationRow = {
  stage_id: DockerSimulationStageId;
  attempts: number;
  verified_at: Date | string | null;
  sp_awarded: number;
  checks: Array<{ key: string; label: string; passed: boolean }>;
};

const expectedSelections: Record<DockerSimulationStageId, Record<string, string>> = {
  container: { image: 'nginx:alpine', name: 'oxsig-academy-web' },
  network: { publish: '18080:80', url: 'http://localhost:18080' },
  storage: { mount: 'oxsig_academy_data:/usr/share/nginx/html', marker: 'OXSIG Academy persistent' },
};

/** Grade configuration state, not a command string supplied by the browser. */
export function evaluateSimulation(
  stageId: DockerSimulationStageId,
  selections: Record<string, string>,
) {
  const stage = simulationStage(stageId);
  const expected = expectedSelections[stageId];
  const known = new Set<string>(stage.slots.map(slot => slot.id));
  const correctFields = Object.keys(selections).every(key => known.has(key));
  const checks = stage.slots.map(slot => ({
    key: slot.id,
    label: slot.label,
    passed: selections[slot.id] === expected[slot.id],
  }));
  return { passed: correctFields && checks.every(check => check.passed), checks };
}

const mapRow = (row: SimulationRow) => ({
  stageId: row.stage_id,
  attempts: Number(row.attempts),
  verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
  spAwarded: Number(row.sp_awarded),
  checks: row.checks || [],
});

export async function simulationState(ownerId: string) {
  const rows = await getPool().query(
    `SELECT stage_id,attempts,verified_at,sp_awarded,checks
       FROM academy_simulation_progress
      WHERE owner_id=$1 AND skill_id=$2 AND curriculum_version=$3`,
    [ownerId, SIMULATION_SKILL, SIMULATOR_VERSION],
  );
  const progress = (rows.rows as SimulationRow[]).map(mapRow);
  const verified = new Set(progress.filter(item => item.verifiedAt).map(item => item.stageId));
  return {
    skillId: SIMULATION_SKILL,
    curriculumVersion: SIMULATOR_VERSION,
    progress,
    practiceSp: progress.reduce((total, row) => total + (row.verifiedAt ? row.spAwarded : 0), 0),
    unlocked: DOCKER_SIMULATION_STAGES.filter(s => stageIsUnlocked(s.id, verified)).map(s => s.id),
    evidenceType: 'browser-simulation' as const,
  };
}

/** An independent progression and practice-score ledger; never writes real lab proof. */
export async function checkSimulationStage(
  ownerId: string,
  stageId: DockerSimulationStageId,
  selections: Record<string, string>,
) {
  const result = await transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`academy:simulation:${ownerId}:${SIMULATION_SKILL}`]);
    const current = await db.query(
      `SELECT stage_id,verified_at FROM academy_simulation_progress
       WHERE owner_id=$1 AND skill_id=$2 AND curriculum_version=$3 AND verified_at IS NOT NULL`,
      [ownerId, SIMULATION_SKILL, SIMULATOR_VERSION],
    );
    const completed = new Set<string>(current.rows.map(row => row.stage_id as string));
    if (!stageIsUnlocked(stageId, completed)) {
      throw new SimulationError('Complete the preceding checkpoint to unlock this station.', 'SIMULATION_LOCKED');
    }

    const grading = evaluateSimulation(stageId, selections);
    // Immutable completed checkpoints: a replay must never remove points or reset progress.
    if (completed.has(stageId)) return grading;

    await db.query(
      `INSERT INTO academy_simulation_progress
        (owner_id,skill_id,stage_id,curriculum_version,attempts,checks,verified_at,sp_awarded)
       VALUES($1,$2,$3,$4,1,$5::jsonb,CASE WHEN $6 THEN NOW() ELSE NULL END,CASE WHEN $6 THEN $7 ELSE 0 END)
       ON CONFLICT (owner_id,skill_id,stage_id,curriculum_version) DO UPDATE
         SET attempts=LEAST(10000,academy_simulation_progress.attempts+1),
             checks=EXCLUDED.checks,
             verified_at=CASE WHEN EXCLUDED.verified_at IS NOT NULL
                         THEN COALESCE(academy_simulation_progress.verified_at,EXCLUDED.verified_at)
                         ELSE academy_simulation_progress.verified_at END,
             sp_awarded=GREATEST(academy_simulation_progress.sp_awarded,EXCLUDED.sp_awarded),
             updated_at=NOW()`,
      [ownerId, SIMULATION_SKILL, stageId, SIMULATOR_VERSION,
        JSON.stringify(grading.checks), grading.passed, SIMULATION_SP_PER_STAGE],
    );
    return grading;
  });
  return { ...result, state: await simulationState(ownerId) };
}
