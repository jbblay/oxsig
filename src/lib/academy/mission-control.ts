import 'server-only';

import { getPool } from '@/lib/db/pool';
import { executeLabCommand } from '@/lib/labs/aws-runtime';
import { LAB_CATALOG } from '@/lib/labs/catalog';
import { answerAcademyQuestion } from '@/lib/academy/server';
import {
  DOCKER_FAULT_COMMAND,
  DOCKER_MISSIONS,
  DOCKER_VERIFY_COMMAND,
  MISSION_IDS,
  assessDockerMission,
  type DockerMissionId,
  type MissionDifficulty,
} from './docker-missions';

export class MissionControlError extends Error {
  constructor(message: string, readonly code: string, readonly status = 409) {
    super(message);
    this.name = 'MissionControlError';
  }
}

type MissionRow = {
  mission_id: DockerMissionId;
  lab_instance_id: string | null;
  difficulty: MissionDifficulty;
  notes: string;
  hints_used: number;
  prepared_at: string | Date | null;
  verified_at: string | Date | null;
  checks: Array<{ key: string; label: string; passed: boolean }>;
  updated_at: string | Date;
};
const iso = (value: string | Date | null) => value ? new Date(value).toISOString() : null;

function mapRow(row: MissionRow) {
  return {
    missionId: row.mission_id,
    labInstanceId: row.lab_instance_id,
    difficulty: row.difficulty,
    notes: row.notes,
    hintsUsed: row.hints_used,
    preparedAt: iso(row.prepared_at),
    verifiedAt: iso(row.verified_at),
    checks: row.checks || [],
    updatedAt: iso(row.updated_at),
  };
}

export async function listMissionProgress(ownerId: string) {
  const records = await getPool().query(
    `SELECT mission_id,lab_instance_id,difficulty,notes,hints_used,prepared_at,verified_at,checks,updated_at
     FROM academy_mission_progress WHERE owner_id=$1`,
    [ownerId]
  );
  return { progress: records.rows.map((row: MissionRow) => mapRow(row)), missions: DOCKER_MISSIONS };
}

async function getProgressRow(ownerId: string, id: DockerMissionId): Promise<MissionRow | null> {
  const rows = await getPool().query(
    `SELECT mission_id,lab_instance_id,difficulty,notes,hints_used,prepared_at,verified_at,checks,updated_at
     FROM academy_mission_progress WHERE owner_id=$1 AND mission_id=$2`,
    [ownerId, id]
  );
  return (rows.rows[0] as MissionRow) || null;
}

async function ensureUnlocked(ownerId: string, id: DockerMissionId) {
  const position = MISSION_IDS.indexOf(id);
  if (position === -1) throw new MissionControlError('Unknown Academy mission', 'MISSION_NOT_FOUND', 404);
  if (position > 0) {
    const previous = await getProgressRow(ownerId, MISSION_IDS[position - 1]);
    if (!previous?.verified_at) {
      throw new MissionControlError('Complete the previous verified mission to unlock this one.', 'MISSION_LOCKED');
    }
  }
}

async function runningLab(ownerId: string, labInstanceId: string) {
  const result = await getPool().query(
    `SELECT instance.id,instance.status,instance.runtime_provider,instance.runtime_external_id,
            instance.expires_at,definition.slug
     FROM lab_instances instance JOIN lab_definitions definition ON definition.id=instance.definition_id
     WHERE instance.id=$1 AND instance.owner_id=$2 LIMIT 1`,
    [labInstanceId, ownerId]
  );
  const lab = result.rows[0];
  if (!lab) throw new MissionControlError('No matching learner-owned lab exists.', 'LAB_NOT_FOUND', 404);
  if (lab.status !== 'running' || (lab.expires_at && new Date(lab.expires_at).getTime() <= Date.now())) {
    throw new MissionControlError('Start a non-expired Cyber Lab machine before continuing.', 'LAB_NOT_RUNNING');
  }
  if (lab.runtime_provider !== 'aws-ec2' || !lab.runtime_external_id || !LAB_CATALOG.some(
    item => item.slug === lab.slug && item.platform === 'linux'
  )) {
    throw new MissionControlError('Missions require a supported managed Linux lab.', 'LAB_UNSUPPORTED');
  }
  return lab.runtime_external_id as string;
}

export async function saveMissionNotes(ownerId: string, id: DockerMissionId, notes: string) {
  await ensureUnlocked(ownerId, id);
  const rows = await getPool().query(
    `INSERT INTO academy_mission_progress (owner_id,mission_id,notes)
     VALUES ($1,$2,$3)
     ON CONFLICT (owner_id,mission_id) DO UPDATE
       SET notes=EXCLUDED.notes,updated_at=NOW()
     RETURNING mission_id,lab_instance_id,difficulty,notes,hints_used,prepared_at,verified_at,checks,updated_at`,
    [ownerId, id, notes]
  );
  return mapRow(rows.rows[0]);
}

export async function markMissionHint(ownerId: string, id: DockerMissionId) {
  await ensureUnlocked(ownerId, id);
  const rows = await getPool().query(
    `INSERT INTO academy_mission_progress(owner_id,mission_id,hints_used)
     VALUES($1,$2,1)
     ON CONFLICT(owner_id,mission_id) DO UPDATE
       SET hints_used=LEAST(100,academy_mission_progress.hints_used+1),updated_at=NOW()
     RETURNING mission_id,lab_instance_id,difficulty,notes,hints_used,prepared_at,verified_at,checks,updated_at`,
    [ownerId, id]
  );
  return mapRow(rows.rows[0]);
}

export async function prepareRepairMission(ownerId: string, labInstanceId: string) {
  await ensureUnlocked(ownerId, 'repair');
  const previous = await getProgressRow(ownerId, 'repair');
  if (previous?.verified_at) throw new MissionControlError('This incident is already verified.', 'MISSION_COMPLETED');
  const externalId = await runningLab(ownerId, labInstanceId);
  // Explicit user consent must precede this call. Only the reserved Academy
  // container is replaced; no other containers, services or networks are modified.
  const output = await executeLabCommand(externalId, DOCKER_FAULT_COMMAND, 'linux');
  if (output.status !== 'Success' || output.exitCode !== 0) {
    throw new MissionControlError(
      'Could not seed the isolated Docker incident. Confirm Docker is installed and the image is accessible.',
      'FAULT_SEED_FAILED', 502
    );
  }
  const rows = await getPool().query(
    `INSERT INTO academy_mission_progress(owner_id,mission_id,lab_instance_id,prepared_at)
     VALUES($1,'repair',$2,NOW())
     ON CONFLICT(owner_id,mission_id) DO UPDATE
       SET lab_instance_id=EXCLUDED.lab_instance_id,prepared_at=NOW(),verified_at=NULL,checks='[]'::jsonb,updated_at=NOW()
     RETURNING mission_id,lab_instance_id,difficulty,notes,hints_used,prepared_at,verified_at,checks,updated_at`,
    [ownerId, labInstanceId]
  );
  return mapRow(rows.rows[0]);
}

export async function verifyDockerMission(
  ownerId: string,
  id: DockerMissionId,
  labInstanceId: string,
  difficulty: MissionDifficulty
) {
  await ensureUnlocked(ownerId, id);
  const current = await getProgressRow(ownerId, id);
  if (id === 'repair' && (!current?.prepared_at || current.lab_instance_id !== labInstanceId)) {
    throw new MissionControlError('Seed this incident in the selected lab before verifying the fix.', 'FAULT_REQUIRED');
  }
  const externalId = await runningLab(ownerId, labInstanceId);
  const output = await executeLabCommand(externalId, DOCKER_VERIFY_COMMAND, 'linux');
  if (output.status !== 'Success') {
    throw new MissionControlError('Lab verification was not delivered successfully.', 'VERIFICATION_UNAVAILABLE', 503);
  }
  const assessment = assessDockerMission(id, output.stdout);
  // Never grant progression based on browser-supplied results or AI assertions.
  const passed = output.exitCode === 0 && assessment.passed;
  const rows = await getPool().query(
    `INSERT INTO academy_mission_progress
       (owner_id,mission_id,lab_instance_id,difficulty,checks,verified_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,CASE WHEN $6 THEN NOW() ELSE NULL END)
     ON CONFLICT (owner_id,mission_id) DO UPDATE
       SET lab_instance_id=EXCLUDED.lab_instance_id,
           difficulty=EXCLUDED.difficulty,
           checks=EXCLUDED.checks,
           verified_at=CASE WHEN $6 THEN COALESCE(academy_mission_progress.verified_at,NOW()) ELSE academy_mission_progress.verified_at END,
           updated_at=NOW()
     RETURNING mission_id,lab_instance_id,difficulty,notes,hints_used,prepared_at,verified_at,checks,updated_at`,
    [ownerId, id, labInstanceId, difficulty, JSON.stringify(assessment.checks), passed]
  );
  return { passed, progress: mapRow(rows.rows[0]), checks: assessment.checks, provenance: 'server-executed' as const };
}

export async function askMissionMentor(
  ownerId: string,
  id: DockerMissionId,
  question: string,
  difficulty: MissionDifficulty
) {
  await ensureUnlocked(ownerId, id);
  const mission = DOCKER_MISSIONS.find(item => item.id === id)!;
  return answerAcademyQuestion({
    courseTitle: 'OXSIG Academy Docker Missions',
    lessonTitle: mission.title,
    question,
    lessonContext: [
      mission.ticket, mission.objective, mission.concepts,
      'Use only the authorized learner-owned Docker lab and Academy-namespaced resources.',
      difficulty === 'advanced'
        ? 'This is advanced independent practice. Prefer diagnostic questions and concepts instead of giving the full command or finished answer.'
        : difficulty === 'intermediate'
          ? 'Prefer one diagnostic hint at a time, and ask the learner to inspect evidence.'
          : 'The learner is a beginner. Offer clear, gentle explanations and short commands when useful.',
      'You cannot run commands or verify state. Verification is performed separately by the server.',
    ].join('\n'),
  });
}
