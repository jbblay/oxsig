import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPool, transaction } from '@/lib/db/pool';

export const EVIDENCE_PROVENANCE = [
  'browser-observed',
  'server-executed',
  'provider-attested',
  'learner-provided',
] as const;

export type EvidenceProvenance = (typeof EVIDENCE_PROVENANCE)[number];
export type EvidenceSurface = 'ai-practitioner' | 'academy' | 'infrastructure-designer';
export type EvidenceState = 'authorized' | 'executing' | 'evidence_recorded' | 'analyzed' | 'failed' | 'expired';
export type EvidenceAnalysisKind = 'ai-practitioner' | 'academy' | 'deployment';

const TERMINAL_RECEIPT_TTL_SECONDS = 120;
const evidenceStateSchema = z.enum(['authorized', 'executing', 'evidence_recorded', 'analyzed', 'failed', 'expired']);
const provenanceSchema = z.enum(EVIDENCE_PROVENANCE);

export type ExecutionEvidenceRecord = {
  id: string;
  ownerId: string;
  labInstanceId?: string;
  deploymentAuthorizationId?: string;
  executionId: string;
  source: 'interactive-terminal' | 'deployment';
  surface: string;
  provenance: EvidenceProvenance;
  state: EvidenceState;
  commandHash?: string;
  command?: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
  payload: Record<string, unknown>;
  analysisKind?: string;
  analysis?: Record<string, unknown>;
  model?: string;
  expiresAt?: string;
  executionStartedAt?: string;
  evidenceRecordedAt?: string;
  analyzedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export class ExecutionEvidenceConflictError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ExecutionEvidenceConflictError';
  }
}

function iso(value: unknown) {
  return new Date(String(value)).toISOString();
}

function mapRow(row: Record<string, any>): ExecutionEvidenceRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    ...(row.lab_instance_id ? { labInstanceId: String(row.lab_instance_id) } : {}),
    ...(row.deployment_authorization_id ? { deploymentAuthorizationId: String(row.deployment_authorization_id) } : {}),
    executionId: String(row.execution_id),
    source: row.source === 'deployment' ? 'deployment' : 'interactive-terminal',
    surface: String(row.surface),
    provenance: provenanceSchema.parse(row.provenance),
    state: evidenceStateSchema.parse(row.state),
    ...(row.command_hash ? { commandHash: String(row.command_hash) } : {}),
    ...(row.command ? { command: String(row.command) } : {}),
    stdout: row.stdout ? String(row.stdout) : '',
    stderr: row.stderr ? String(row.stderr) : '',
    ...(row.exit_code === null || row.exit_code === undefined ? {} : { exitCode: Number(row.exit_code) }),
    payload: (row.payload || {}) as Record<string, unknown>,
    ...(row.analysis_kind ? { analysisKind: String(row.analysis_kind) } : {}),
    ...(row.analysis ? { analysis: row.analysis as Record<string, unknown> } : {}),
    ...(row.model ? { model: String(row.model) } : {}),
    ...(row.expires_at ? { expiresAt: iso(row.expires_at) } : {}),
    ...(row.execution_started_at ? { executionStartedAt: iso(row.execution_started_at) } : {}),
    ...(row.evidence_recorded_at ? { evidenceRecordedAt: iso(row.evidence_recorded_at) } : {}),
    ...(row.analyzed_at ? { analyzedAt: iso(row.analyzed_at) } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function assertAnalysisSurface(row: Record<string, any>, analysisKind: EvidenceAnalysisKind) {
  const valid =
    (analysisKind === 'ai-practitioner' && row.source === 'interactive-terminal' && row.surface === 'ai-practitioner') ||
    (analysisKind === 'academy' && row.source === 'interactive-terminal' && row.surface === 'academy') ||
    (analysisKind === 'deployment' && row.source === 'deployment' && row.surface === 'infrastructure-designer' && row.provenance === 'provider-attested');

  if (!valid) {
    throw new ExecutionEvidenceConflictError(
      'Execution evidence does not belong to the requested analysis surface.',
      'EVIDENCE_ANALYSIS_SURFACE_MISMATCH'
    );
  }
}

export function executionCommandHash(command: string) {
  return createHash('sha256').update(command.trim(), 'utf8').digest('hex');
}

async function expireTerminalReceipts(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, any>[] }> },
  ownerId: string,
  labInstanceId: string
) {
  await client.query(
    `UPDATE execution_evidence
        SET state='expired', updated_at=NOW()
      WHERE owner_id=$1
        AND lab_instance_id=$2
        AND source='interactive-terminal'
        AND state IN ('authorized','executing')
        AND expires_at <= NOW()`,
    [ownerId, labInstanceId]
  );
}

export async function authorizeTerminalEvidence(input: {
  ownerId: string;
  labInstanceId: string;
  command: string;
  surface: 'ai-practitioner' | 'academy';
  metadata?: Record<string, unknown>;
}) {
  const command = input.command.trim();
  const commandHash = executionCommandHash(command);
  const executionId = randomUUID();

  return transaction(async (client) => {
    await expireTerminalReceipts(client, input.ownerId, input.labInstanceId);

    await client.query(
      `UPDATE execution_evidence
          SET state='expired', updated_at=NOW()
        WHERE owner_id=$1
          AND lab_instance_id=$2
          AND source='interactive-terminal'
          AND command_hash=$3
          AND state IN ('authorized','executing')`,
      [input.ownerId, input.labInstanceId, commandHash]
    );

    const result = await client.query(
      `INSERT INTO execution_evidence (
         owner_id, lab_instance_id, execution_id, source, surface, provenance,
         state, command_hash, command, payload, expires_at
       ) VALUES (
         $1,$2,$3,'interactive-terminal',$4,'browser-observed',
         'authorized',$5,$6,$7::jsonb,
         NOW() + ($8 * INTERVAL '1 second')
       )
       RETURNING *`,
      [
        input.ownerId,
        input.labInstanceId,
        executionId,
        input.surface,
        commandHash,
        command,
        JSON.stringify(input.metadata || {}),
        TERMINAL_RECEIPT_TTL_SECONDS,
      ]
    );

    return mapRow(result.rows[0]);
  });
}

export async function recordBrowserObservedEvidence(input: {
  ownerId: string;
  labInstanceId: string;
  command: string;
  executionId?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}) {
  const command = input.command.trim();
  const commandHash = executionCommandHash(command);

  return transaction(async (client) => {
    await expireTerminalReceipts(client, input.ownerId, input.labInstanceId);

    const params: unknown[] = [input.ownerId, input.labInstanceId, commandHash];
    let executionClause = '';
    if (input.executionId) {
      params.push(input.executionId);
      executionClause = `AND execution_id=$4`;
    }

    const locked = await client.query(
      `SELECT *
         FROM execution_evidence
        WHERE owner_id=$1
          AND lab_instance_id=$2
          AND source='interactive-terminal'
          AND command_hash=$3
          ${executionClause}
          AND state IN ('authorized','executing')
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      params
    );
    const row = locked.rows[0];
    if (!row) {
      throw new ExecutionEvidenceConflictError(
        'No active one-time execution receipt matches this command and lab.',
        'EXECUTION_RECEIPT_NOT_ACTIVE'
      );
    }
    if (String(row.command) !== command) {
      throw new ExecutionEvidenceConflictError(
        'The command no longer matches the authorized execution receipt.',
        'EXECUTION_COMMAND_MISMATCH'
      );
    }

    if (row.state === 'authorized') {
      const started = await client.query(
        `UPDATE execution_evidence
            SET state='executing', execution_started_at=COALESCE(execution_started_at,NOW()), updated_at=NOW()
          WHERE id=$1 AND owner_id=$2 AND state='authorized'
          RETURNING id`,
        [row.id, input.ownerId]
      );
      if (!started.rows[0]) {
        throw new ExecutionEvidenceConflictError(
          'The execution receipt was consumed by another request.',
          'EXECUTION_RECEIPT_CONSUMED'
        );
      }
    }

    const recorded = await client.query(
      `UPDATE execution_evidence
          SET state='evidence_recorded',
              stdout=$1,
              stderr=$2,
              exit_code=$3,
              execution_started_at=COALESCE(execution_started_at,NOW()),
              evidence_recorded_at=NOW(),
              updated_at=NOW()
        WHERE id=$4
          AND owner_id=$5
          AND state='executing'
        RETURNING *`,
      [input.stdout, input.stderr, input.exitCode, row.id, input.ownerId]
    );
    if (!recorded.rows[0]) {
      throw new ExecutionEvidenceConflictError(
        'The execution receipt was already used.',
        'EXECUTION_RECEIPT_CONSUMED'
      );
    }

    return mapRow(recorded.rows[0]);
  });
}

export async function getTerminalEvidenceForAnalysis(input: {
  ownerId: string;
  command: string;
  surface: 'ai-practitioner' | 'academy';
  labInstanceId?: string;
  evidenceId?: string;
}) {
  const command = input.command.trim();
  const commandHash = executionCommandHash(command);
  const params: unknown[] = [input.ownerId, input.surface, commandHash];
  let cursor = 4;
  const clauses: string[] = [];

  if (input.labInstanceId) {
    clauses.push(`lab_instance_id=$${cursor}`);
    params.push(input.labInstanceId);
    cursor += 1;
  }
  if (input.evidenceId) {
    clauses.push(`id=$${cursor}`);
    params.push(input.evidenceId);
  }

  const result = await getPool().query(
    `SELECT *
       FROM execution_evidence
      WHERE owner_id=$1
        AND source='interactive-terminal'
        AND surface=$2
        AND command_hash=$3
        AND state IN ('evidence_recorded','analyzed')
        ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
      ORDER BY evidence_recorded_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    params
  );

  const row = result.rows[0];
  if (!row || String(row.command) !== command) {
    throw new ExecutionEvidenceConflictError(
      'No recorded execution evidence matches this command and learning surface.',
      'EVIDENCE_NOT_FOUND'
    );
  }
  return mapRow(row);
}

export async function getDeploymentEvidenceForAnalysis(input: {
  ownerId: string;
  authorizationId: string;
}) {
  const result = await getPool().query(
    `SELECT *
       FROM execution_evidence
      WHERE owner_id=$1
        AND deployment_authorization_id=$2
        AND source='deployment'
        AND surface='infrastructure-designer'
        AND provenance='provider-attested'
        AND state IN ('evidence_recorded','analyzed')
      ORDER BY evidence_recorded_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [input.ownerId, input.authorizationId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new ExecutionEvidenceConflictError(
      'No provider-attested deployment evidence is ready for this authorization.',
      'DEPLOYMENT_EVIDENCE_NOT_FOUND'
    );
  }
  return mapRow(row);
}

export async function storeExecutionEvidenceAnalysis(input: {
  ownerId: string;
  evidenceId: string;
  analysisKind: EvidenceAnalysisKind;
  analysis: Record<string, unknown>;
  model: string;
}) {
  return transaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM execution_evidence WHERE id=$1 AND owner_id=$2 FOR UPDATE`,
      [input.evidenceId, input.ownerId]
    );
    const row = locked.rows[0];
    if (!row) {
      throw new ExecutionEvidenceConflictError('Execution evidence was not found.', 'EVIDENCE_NOT_FOUND');
    }

    assertAnalysisSurface(row, input.analysisKind);

    if (row.state === 'analyzed') {
      if (String(row.analysis_kind || '') !== input.analysisKind || !row.analysis) {
        throw new ExecutionEvidenceConflictError(
          'Execution evidence was already analyzed by a different learning surface.',
          'EVIDENCE_ALREADY_ANALYZED'
        );
      }
      return mapRow(row);
    }
    if (row.state !== 'evidence_recorded') {
      throw new ExecutionEvidenceConflictError(
        'Execution evidence is not ready for analysis.',
        'EVIDENCE_NOT_READY'
      );
    }

    const updated = await client.query(
      `UPDATE execution_evidence
          SET state='analyzed',
              analysis_kind=$1,
              analysis=$2::jsonb,
              model=$3,
              analyzed_at=NOW(),
              updated_at=NOW()
        WHERE id=$4 AND owner_id=$5 AND state='evidence_recorded'
        RETURNING *`,
      [input.analysisKind, JSON.stringify(input.analysis), input.model, input.evidenceId, input.ownerId]
    );
    const analyzedRow = updated.rows[0];
    if (!analyzedRow) {
      throw new ExecutionEvidenceConflictError(
        'Execution evidence was analyzed by another request.',
        'EVIDENCE_ALREADY_ANALYZED'
      );
    }

    if (input.analysisKind === 'deployment') {
      const authorizationId = analyzedRow.deployment_authorization_id;
      const labInstanceId = analyzedRow.lab_instance_id;
      const executionId = analyzedRow.execution_id;
      if (!authorizationId || !labInstanceId || !executionId) {
        throw new ExecutionEvidenceConflictError(
          'Deployment evidence is missing its authorization binding.',
          'DEPLOYMENT_EVIDENCE_BINDING_MISSING'
        );
      }

      const transitioned = await client.query(
        `UPDATE deployment_authorizations
            SET state='analyzed', analyzed_at=COALESCE(analyzed_at,NOW()), updated_at=NOW()
          WHERE id=$1
            AND owner_id=$2
            AND execution_id=$3
            AND lab_instance_id=$4
            AND state='evidence_recorded'
          RETURNING id`,
        [authorizationId, input.ownerId, executionId, labInstanceId]
      );

      if (!transitioned.rows[0]) {
        const current = await client.query(
          `SELECT state
             FROM deployment_authorizations
            WHERE id=$1 AND owner_id=$2 AND execution_id=$3 AND lab_instance_id=$4
            LIMIT 1`,
          [authorizationId, input.ownerId, executionId, labInstanceId]
        );
        if (String(current.rows[0]?.state || '') !== 'analyzed') {
          throw new ExecutionEvidenceConflictError(
            'Deployment authorization could not advance to analyzed state.',
            'DEPLOYMENT_ANALYSIS_STATE_MISMATCH'
          );
        }
      }
    }

    return mapRow(analyzedRow);
  });
}