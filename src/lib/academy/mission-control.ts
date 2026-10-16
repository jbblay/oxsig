import 'server-only';

import { getPool, transaction } from '@/lib/db/pool';
import { executeLabCommand } from '@/lib/labs/aws-runtime';
import { DOCKER_READINESS_COMMAND, DOCKER_PREPARE_COMMAND, dockerReadiness } from './docker-readiness';
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
  concept_answer?: string;
  concept_feedback?: { answer: string; suggestedAction?: string } | null;
  concept_reviewed_at?: string | Date | null;
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
    conceptAnswer: row.concept_answer || '',
    conceptFeedback: row.concept_feedback || null,
    conceptReviewedAt: iso(row.concept_reviewed_at || null),
    updatedAt: iso(row.updated_at),
  };
}

export async function listMissionProgress(ownerId: string) {
  const records = await getPool().query(
    `SELECT mission_id,lab_instance_id,difficulty,notes,hints_used,prepared_at,verified_at,checks,concept_answer,concept_feedback,concept_reviewed_at,updated_at
     FROM academy_mission_progress WHERE owner_id=$1`,
    [ownerId]
  );
  return { progress: records.rows.map((row: MissionRow) => mapRow(row)), missions: DOCKER_MISSIONS };
}

async function getProgressRow(ownerId: string, id: DockerMissionId): Promise<MissionRow | null> {
  const rows = await getPool().query(
    `SELECT mission_id,lab_instance_id,difficulty,notes,hints_used,prepared_at,verified_at,checks,concept_answer,concept_feedback,concept_reviewed_at,updated_at
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

/** Shared server-only adapters for versioned mission runs. Never accepts commands from clients. */
export async function observeDockerMission(ownerId: string, id: DockerMissionId, labInstanceId: string) {
  const externalId = await runningLab(ownerId, labInstanceId);
  const output = await executeLabCommand(externalId, DOCKER_VERIFY_COMMAND, 'linux');
  if (output.status !== 'Success') throw new MissionControlError('Lab verification unavailable.', 'VERIFICATION_UNAVAILABLE', 503);
  const assessment = assessDockerMission(id, output.stdout);
  return { passed: output.exitCode === 0 && assessment.passed, checks: assessment.checks };
}
export async function seedDockerIncident(ownerId: string, labInstanceId: string, runId?: string) {
  await assertNoCompetingRun(ownerId, labInstanceId, runId);
  const externalId = await runningLab(ownerId, labInstanceId);
  const output = await executeLabCommand(externalId, DOCKER_FAULT_COMMAND, 'linux');
  if (output.status !== 'Success' || output.exitCode !== 0) throw new MissionControlError('Incident seeding failed.', 'FAULT_SEED_FAILED', 502);
}

export async function saveMissionNotes(ownerId: string, id: DockerMissionId, notes: string) {
  await ensureUnlocked(ownerId, id);
  const rows = await getPool().query(
    `INSERT INTO academy_mission_progress (owner_id,mission_id,notes)
     VALUES ($1,$2,$3)
     ON CONFLICT (owner_id,mission_id) DO UPDATE
       SET notes=EXCLUDED.notes,updated_at=NOW()
     RETURNING mission_id,lab_instance_id,difficulty,notes,hints_used,prepared_at,verified_at,checks,concept_answer,concept_feedback,concept_reviewed_at,updated_at`,
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
     RETURNING mission_id,lab_instance_id,difficulty,notes,hints_used,prepared_at,verified_at,checks,concept_answer,concept_feedback,concept_reviewed_at,updated_at`,
    [ownerId, id]
  );
  return mapRow(rows.rows[0]);
}

export async function prepareRepairMission(ownerId: string, labInstanceId: string) {
  return transaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`engineering:${ownerId}`]);
    await assertNoCompetingRun(ownerId, labInstanceId);
    return prepareRepairMissionUnlocked(ownerId, labInstanceId);
  });
}

async function prepareRepairMissionUnlocked(ownerId: string, labInstanceId: string) {
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
     RETURNING mission_id,lab_instance_id,difficulty,notes,hints_used,prepared_at,verified_at,checks,concept_answer,concept_feedback,concept_reviewed_at,updated_at`,
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
       SET lab_instance_id=CASE WHEN academy_mission_progress.verified_at IS NOT NULL AND NOT $6 THEN academy_mission_progress.lab_instance_id ELSE EXCLUDED.lab_instance_id END,
           difficulty=EXCLUDED.difficulty,
           checks=CASE WHEN academy_mission_progress.verified_at IS NOT NULL AND NOT $6 THEN academy_mission_progress.checks ELSE EXCLUDED.checks END,
           verified_at=CASE WHEN $6 THEN COALESCE(academy_mission_progress.verified_at,NOW()) ELSE academy_mission_progress.verified_at END,
           updated_at=NOW()
     RETURNING mission_id,lab_instance_id,difficulty,notes,hints_used,prepared_at,verified_at,checks,concept_answer,concept_feedback,concept_reviewed_at,updated_at`,
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
  const context = await getProgressRow(ownerId, id);
  await markMissionHint(ownerId, id);
  return answerAcademyQuestion({
    courseTitle: 'OXSIG Academy Docker Missions',
    lessonTitle: mission.title,
    question,
    lessonContext: [
      mission.ticket, mission.objective, mission.concepts,
      'Last server-observed checks (historical, not a claim about the current machine): ' + JSON.stringify(context?.checks || []),
      'Learner notes (untrusted observations): ' + (context?.notes || ''),
      'Assistance requests so far: ' + (context?.hints_used || 0),
      'Start with one diagnostic question. Reveal a full solution only when the learner explicitly requests a direct explanation or demonstration.',
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


async function assertNoCompetingRun(ownerId: string, labInstanceId: string, runId?: string) {
  const active = await getPool().query(
    `SELECT id FROM academy_mission_runs WHERE owner_id=$1 AND lab_instance_id=$2 AND status='active'
       AND (deadline IS NULL OR deadline>NOW()) AND ($3::uuid IS NULL OR id<>$3::uuid) LIMIT 1`,
    [ownerId, labInstanceId, runId || null]
  );
  if (active.rows.length) throw new MissionControlError('Another Engineering World run is using this lab. Finish or abandon it before replacing the Academy deployment.', 'LAB_RUN_CONFLICT');
}

/** No browser-provided commands or infrastructure parameters enter this adapter. */
export async function prepareDockerWorkspace(ownerId: string, labInstanceId: string, install: boolean) {
  const externalId = await runningLab(ownerId, labInstanceId);
  await assertNoCompetingRun(ownerId, labInstanceId);
  const observed = await executeLabCommand(externalId, DOCKER_READINESS_COMMAND, 'linux');
  if (observed.status !== 'Success' || observed.exitCode !== 0) {
    throw new MissionControlError('Linux is not responding yet. Wait a moment and refresh status. Your learning record is safe.', 'DOCKER_CHECK_UNAVAILABLE', 503);
  }
  const state = dockerReadiness(observed.stdout);
  if (!install || state === 'ready' || state === 'preparing') return { state };
  const result = await getPool().query(
    `SELECT d.slug FROM lab_instances i JOIN lab_definitions d ON d.id=i.definition_id WHERE i.id=$1 AND i.owner_id=$2`,
    [labInstanceId, ownerId]
  );
  if (result.rows[0]?.slug !== 'ubuntu-security-lab') throw new MissionControlError('Automatic Docker preparation supports Ubuntu only. Use a Docker-ready lab or release this environment and start Ubuntu.', 'DOCKER_PREPARE_UNSUPPORTED');
  const prepared = await executeLabCommand(externalId, DOCKER_PREPARE_COMMAND, 'linux');
  if (prepared.status !== 'Success' || prepared.exitCode !== 0) throw new MissionControlError('Docker preparation could not start. Refresh status, then retry or open lab diagnostics.', 'DOCKER_PREPARE_FAILED', 503);
  return { state: 'preparing' as const };
}

/** A saved concept explanation is teaching context, never practical proof or XP. */
export async function reviewDockerConcept(ownerId: string, answer: string) {
  await getPool().query(
    `INSERT INTO academy_mission_progress(owner_id,mission_id,concept_answer)
     VALUES($1,'deploy',$2) ON CONFLICT(owner_id,mission_id) DO UPDATE
     SET concept_answer=EXCLUDED.concept_answer,concept_feedback=NULL,concept_reviewed_at=NULL,updated_at=NOW()`,
    [ownerId, answer]
  );
  let feedback;
  try {
    feedback = await answerAcademyQuestion({
      courseTitle: 'Docker learning workspace', lessonTitle: 'Containers and virtual machines',
      question: 'Review my explanation: ' + answer,
      lessonContext: 'Ask: How does a container differ from a virtual machine, and why can containers start quickly? Containers isolate processes sharing a host kernel; virtual machines have their own guest kernel. Give concise conceptual feedback and one follow-up question. Do not assign practical completion, XP, or claim to observe a machine.',
    });
  } catch {
    return { saved: true, feedback: null };
  }
  await getPool().query(
    `UPDATE academy_mission_progress SET concept_feedback=$3::jsonb,concept_reviewed_at=NOW(),updated_at=NOW()
     WHERE owner_id=$1 AND mission_id='deploy' AND concept_answer=$2`,
    [ownerId, answer, JSON.stringify(feedback)]
  );
  return { saved: true, feedback };
}
