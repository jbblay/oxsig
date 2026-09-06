import 'server-only';

import { randomUUID } from 'crypto';
import { getPool } from '@/lib/db/pool';
import { LAB_CATALOG } from '@/lib/labs/catalog';
import { executeLabCommand } from '@/lib/labs/aws-runtime';
import type { AcademyCourse } from './types';

export const FAILURE_TEMPLATE_ID = 'synthetic-config-mismatch-v1' as const;

export type FailureAttemptState = 'preparing' | 'injected' | 'remediated' | 'cleaned' | 'failed';

export type FailureEvidence = {
  provenance: 'server-executed';
  check: 'pre' | 'fault' | 'verify' | 'cleanup';
  stdout: string;
  stderr: string;
  exitCode: number;
  observedAt: string;
};

export type AcademyFailureAttempt = {
  id: string;
  lessonId: string;
  labInstanceId: string;
  templateId: typeof FAILURE_TEMPLATE_ID;
  state: FailureAttemptState;
  workspacePath: string;
  challenge: string;
  constraints: string[];
  preEvidence: FailureEvidence | null;
  faultEvidence: FailureEvidence | null;
  verificationEvidence: FailureEvidence | null;
  cleanupEvidence: FailureEvidence | null;
  failureReason: string | null;
  createdAt: string;
  injectedAt: string | null;
  remediatedAt: string | null;
  cleanedAt: string | null;
};

export class AcademyFailureInjectionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 409
  ) {
    super(message);
    this.name = 'AcademyFailureInjectionError';
  }
}

type RuntimeBinding = {
  courseId: string;
  lessonId: string;
  labInstanceId: string;
  externalId: string;
};

type AttemptRow = {
  id: string;
  lesson_id: string;
  lab_instance_id: string;
  template_id: string;
  state: FailureAttemptState;
  workspace_path: string;
  pre_evidence: FailureEvidence | null;
  fault_evidence: FailureEvidence | null;
  verification_evidence: FailureEvidence | null;
  cleanup_evidence: FailureEvidence | null;
  failure_reason: string | null;
  created_at: string | Date;
  injected_at: string | Date | null;
  remediated_at: string | Date | null;
  cleaned_at: string | Date | null;
};

const CHALLENGE = 'A synthetic application is unhealthy because its active configuration diverges from its known-good default. Diagnose the mismatch in the isolated workspace and restore the active configuration, then ask OXSIG to verify recovery.';
const CONSTRAINTS = [
  'The challenge is isolated under /tmp/oxsig-failure-labs and does not modify system services.',
  'Use the normal learner terminal to inspect and repair only files inside this attempt workspace.',
  'Do not delete app.defaults; it represents the known-good reference state.',
  'OXSIG verification and cleanup use fixed server-owned commands; AI does not generate mutation commands.',
];

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function toAttempt(row: AttemptRow): AcademyFailureAttempt {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    labInstanceId: row.lab_instance_id,
    templateId: FAILURE_TEMPLATE_ID,
    state: row.state,
    workspacePath: row.workspace_path,
    challenge: CHALLENGE,
    constraints: CONSTRAINTS,
    preEvidence: row.pre_evidence,
    faultEvidence: row.fault_evidence,
    verificationEvidence: row.verification_evidence,
    cleanupEvidence: row.cleanup_evidence,
    failureReason: row.failure_reason,
    createdAt: iso(row.created_at)!,
    injectedAt: iso(row.injected_at),
    remediatedAt: iso(row.remediated_at),
    cleanedAt: iso(row.cleaned_at),
  };
}

function evidence(check: FailureEvidence['check'], result: { stdout?: string; stderr?: string; exitCode?: number }): FailureEvidence {
  return {
    provenance: 'server-executed',
    check,
    stdout: (result.stdout || '').slice(0, 12000),
    stderr: (result.stderr || '').slice(0, 12000),
    exitCode: result.exitCode ?? 1,
    observedAt: new Date().toISOString(),
  };
}

function workspacePath(attemptId: string) {
  return `/tmp/oxsig-failure-labs/${attemptId}`;
}

function precheckCommand(base: string) {
  return `base='${base}'; if [ -e "$base" ]; then echo 'workspace=occupied'; exit 41; else echo 'workspace=clean'; exit 0; fi`;
}

function injectCommand(base: string) {
  return `set -eu; base='${base}'; test ! -e "$base"; mkdir -p "$base"; chmod 700 "$base"; printf 'MODE=healthy\\n' > "$base/app.defaults"; printf 'MODE=broken\\n' > "$base/app.conf"; printf 'Synthetic app configuration troubleshooting challenge.\\n' > "$base/SCENARIO.txt"; chmod 600 "$base/app.defaults" "$base/app.conf" "$base/SCENARIO.txt"; mode=$(sed -n 's/^MODE=//p' "$base/app.conf" | head -n1); printf 'status=unhealthy\\nobserved_mode=%s\\n' "\${mode:-missing}"; exit 23`;
}

function verifyCommand(base: string) {
  return `set -eu; base='${base}'; test -d "$base"; actual=$(sed -n 's/^MODE=//p' "$base/app.conf" | head -n1); expected=$(sed -n 's/^MODE=//p' "$base/app.defaults" | head -n1); if [ -n "$actual" ] && [ "$actual" = "$expected" ]; then printf 'status=healthy\\nobserved_mode=%s\\n' "$actual"; exit 0; fi; printf 'status=unhealthy\\nobserved_mode=%s\\n' "\${actual:-missing}"; exit 23`;
}

function cleanupCommand(base: string) {
  return `set -eu; base='${base}'; case "$base" in /tmp/oxsig-failure-labs/*) rm -rf -- "$base";; *) exit 64;; esac; echo 'cleanup=complete'`;
}

async function resolveBinding(args: {
  ownerId: string;
  courseTitle: string;
  lessonTitle: string;
  labInstanceId: string;
}): Promise<RuntimeBinding> {
  const courseResult = await getPool().query(
    `SELECT id, course_data
     FROM academy_courses
     WHERE owner_id=$1 AND status='active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [args.ownerId]
  );
  const courseRow = courseResult.rows[0];
  if (!courseRow) throw new AcademyFailureInjectionError('No active Academy course was found.', 'ACADEMY_COURSE_NOT_FOUND', 404);
  const course = courseRow.course_data as AcademyCourse;
  if (course.title !== args.courseTitle) {
    throw new AcademyFailureInjectionError('The active Academy course no longer matches this failure lesson.', 'ACADEMY_COURSE_MISMATCH');
  }
  const lesson = course.lessons.find((item) => item.title === args.lessonTitle);
  if (!lesson || !lesson.practice) {
    throw new AcademyFailureInjectionError('Failure injection is only available for an active hands-on Academy lesson.', 'ACADEMY_PRACTICE_REQUIRED');
  }

  const labResult = await getPool().query(
    `SELECT instance.id, instance.status, instance.runtime_provider, instance.runtime_external_id, definition.slug
     FROM lab_instances instance
     JOIN lab_definitions definition ON definition.id=instance.definition_id
     WHERE instance.id=$1 AND instance.owner_id=$2 AND instance.status <> 'destroyed'
     LIMIT 1`,
    [args.labInstanceId, args.ownerId]
  );
  const labRow = labResult.rows[0];
  if (!labRow) throw new AcademyFailureInjectionError('Lab instance not found.', 'LAB_NOT_FOUND', 404);
  if (labRow.status !== 'running') {
    throw new AcademyFailureInjectionError('The Cyber Lab machine must be running for this troubleshooting challenge.', 'LAB_NOT_RUNNING');
  }
  if (labRow.runtime_provider !== 'aws-ec2' || !labRow.runtime_external_id) {
    throw new AcademyFailureInjectionError('This lab does not support managed failure injection.', 'LAB_RUNTIME_UNSUPPORTED');
  }
  const lab = LAB_CATALOG.find((item) => item.slug === labRow.slug);
  if (!lab || lab.platform !== 'linux') {
    throw new AcademyFailureInjectionError('Failure Injection v1 is limited to managed Linux labs.', 'PLATFORM_UNSUPPORTED');
  }

  return {
    courseId: courseRow.id as string,
    lessonId: lesson.id,
    labInstanceId: labRow.id as string,
    externalId: labRow.runtime_external_id as string,
  };
}

async function runtimeForAttempt(ownerId: string, attemptId: string) {
  const result = await getPool().query(
    `SELECT attempt.*,
            instance.status AS lab_status,
            instance.runtime_provider,
            instance.runtime_external_id,
            definition.slug
     FROM academy_failure_attempts attempt
     JOIN lab_instances instance ON instance.id=attempt.lab_instance_id
     JOIN lab_definitions definition ON definition.id=instance.definition_id
     WHERE attempt.id=$1 AND attempt.owner_id=$2
     LIMIT 1`,
    [attemptId, ownerId]
  );
  const row = result.rows[0];
  if (!row) throw new AcademyFailureInjectionError('Failure lesson attempt not found.', 'ATTEMPT_NOT_FOUND', 404);
  if (row.lab_status !== 'running' || row.runtime_provider !== 'aws-ec2' || !row.runtime_external_id) {
    throw new AcademyFailureInjectionError('The bound Cyber Lab must be running to verify or clean this challenge.', 'LAB_NOT_RUNNING');
  }
  const lab = LAB_CATALOG.find((item) => item.slug === row.slug);
  if (!lab || lab.platform !== 'linux') throw new AcademyFailureInjectionError('The bound lab platform is unsupported.', 'PLATFORM_UNSUPPORTED');
  return { row: row as AttemptRow & Record<string, unknown>, externalId: row.runtime_external_id as string };
}

export async function injectAcademyFailure(args: {
  ownerId: string;
  courseTitle: string;
  lessonTitle: string;
  labInstanceId: string;
}): Promise<AcademyFailureAttempt> {
  const binding = await resolveBinding(args);
  const attemptId = randomUUID();
  const base = workspacePath(attemptId);

  try {
    await getPool().query(
      `INSERT INTO academy_failure_attempts (
         id, course_id, owner_id, lesson_id, lab_instance_id, template_id, state, workspace_path
       ) VALUES ($1,$2,$3,$4,$5,$6,'preparing',$7)`,
      [attemptId, binding.courseId, args.ownerId, binding.lessonId, binding.labInstanceId, FAILURE_TEMPLATE_ID, base]
    );
  } catch (error: any) {
    if (error?.code === '23505') {
      throw new AcademyFailureInjectionError('This lab already has an active failure lesson. Verify or clean it before injecting another.', 'ACTIVE_FAILURE_ATTEMPT');
    }
    throw error;
  }

  let preEvidence: FailureEvidence | null = null;
  let faultEvidence: FailureEvidence | null = null;
  try {
    preEvidence = evidence('pre', await executeLabCommand(binding.externalId, precheckCommand(base), 'linux'));
    if (preEvidence.exitCode !== 0) throw new Error('The isolated failure workspace was unexpectedly occupied');

    faultEvidence = evidence('fault', await executeLabCommand(binding.externalId, injectCommand(base), 'linux'));
    if (faultEvidence.exitCode !== 23 || !faultEvidence.stdout.includes('status=unhealthy')) {
      throw new Error('The curated fault did not reach its expected unhealthy state');
    }

    const updated = await getPool().query(
      `UPDATE academy_failure_attempts
       SET state='injected', pre_evidence=$1::jsonb, fault_evidence=$2::jsonb,
           injected_at=NOW(), updated_at=NOW()
       WHERE id=$3 AND owner_id=$4 AND state='preparing'
       RETURNING *`,
      [JSON.stringify(preEvidence), JSON.stringify(faultEvidence), attemptId, args.ownerId]
    );
    if (!updated.rows[0]) throw new Error('Failure attempt state changed before injection could be recorded');
    return toAttempt(updated.rows[0] as AttemptRow);
  } catch (error) {
    let cleanupEvidence: FailureEvidence | null = null;
    try {
      cleanupEvidence = evidence('cleanup', await executeLabCommand(binding.externalId, cleanupCommand(base), 'linux'));
    } catch {
      // Keep the original failure authoritative; TTL/lab teardown still removes /tmp state.
    }
    await getPool().query(
      `UPDATE academy_failure_attempts
       SET state='failed', pre_evidence=COALESCE($1::jsonb, pre_evidence),
           fault_evidence=COALESCE($2::jsonb, fault_evidence),
           cleanup_evidence=COALESCE($3::jsonb, cleanup_evidence),
           failure_reason=$4, updated_at=NOW()
       WHERE id=$5 AND owner_id=$6`,
      [
        preEvidence ? JSON.stringify(preEvidence) : null,
        faultEvidence ? JSON.stringify(faultEvidence) : null,
        cleanupEvidence ? JSON.stringify(cleanupEvidence) : null,
        error instanceof Error ? error.message.slice(0, 1000) : 'Failure injection failed',
        attemptId,
        args.ownerId,
      ]
    );
    throw error;
  }
}

export async function verifyAcademyFailureRemediation(args: {
  ownerId: string;
  attemptId: string;
}): Promise<AcademyFailureAttempt> {
  const { row, externalId } = await runtimeForAttempt(args.ownerId, args.attemptId);
  if (row.state !== 'injected' && row.state !== 'remediated') {
    throw new AcademyFailureInjectionError('Only an injected failure lesson can be verified.', 'ATTEMPT_NOT_INJECTED');
  }
  const verification = evidence('verify', await executeLabCommand(externalId, verifyCommand(row.workspace_path as string), 'linux'));
  const remediated = verification.exitCode === 0 && verification.stdout.includes('status=healthy');
  const updated = await getPool().query(
    `UPDATE academy_failure_attempts
     SET state=$1, verification_evidence=$2::jsonb,
         remediated_at=CASE WHEN $1='remediated' THEN COALESCE(remediated_at, NOW()) ELSE remediated_at END,
         updated_at=NOW()
     WHERE id=$3 AND owner_id=$4
     RETURNING *`,
    [remediated ? 'remediated' : 'injected', JSON.stringify(verification), args.attemptId, args.ownerId]
  );
  return toAttempt(updated.rows[0] as AttemptRow);
}

export async function cleanupAcademyFailure(args: {
  ownerId: string;
  attemptId: string;
}): Promise<AcademyFailureAttempt> {
  const { row, externalId } = await runtimeForAttempt(args.ownerId, args.attemptId);
  if (row.state === 'cleaned') return toAttempt(row as AttemptRow);
  const cleanup = evidence('cleanup', await executeLabCommand(externalId, cleanupCommand(row.workspace_path as string), 'linux'));
  if (cleanup.exitCode !== 0) throw new Error('The isolated failure workspace could not be cleaned');
  const updated = await getPool().query(
    `UPDATE academy_failure_attempts
     SET state='cleaned', cleanup_evidence=$1::jsonb, cleaned_at=NOW(), updated_at=NOW()
     WHERE id=$2 AND owner_id=$3
     RETURNING *`,
    [JSON.stringify(cleanup), args.attemptId, args.ownerId]
  );
  return toAttempt(updated.rows[0] as AttemptRow);
}
