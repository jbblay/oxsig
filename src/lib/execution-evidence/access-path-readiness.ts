import 'server-only';

import { z } from 'zod';
import { getPool, transaction } from '@/lib/db/pool';

const stateSchema = z.enum(['evidence_recorded', 'analyzed']);

export type AccessPathReadinessEvidenceRecord = {
  id: string;
  ownerId: string;
  labInstanceId: string;
  deploymentAuthorizationId: string;
  executionId: string;
  source: 'access-path-readiness';
  surface: 'browser-desktop';
  provenance: 'browser-observed';
  state: 'evidence_recorded' | 'analyzed';
  payload: Record<string, unknown>;
  analysisKind?: 'access-path-readiness';
  analysis?: Record<string, unknown>;
  model?: string;
  evidenceRecordedAt: string;
  analyzedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export class AccessPathReadinessEvidenceConflictError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'AccessPathReadinessEvidenceConflictError';
  }
}

function iso(value: unknown) {
  return new Date(String(value)).toISOString();
}

function mapRow(row: Record<string, any>): AccessPathReadinessEvidenceRecord {
  if (
    row.source !== 'access-path-readiness' ||
    row.surface !== 'browser-desktop' ||
    row.provenance !== 'browser-observed'
  ) {
    throw new AccessPathReadinessEvidenceConflictError(
      'Evidence does not belong to the browser desktop access-path surface.',
      'ACCESS_PATH_SURFACE_MISMATCH'
    );
  }

  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    labInstanceId: String(row.lab_instance_id),
    deploymentAuthorizationId: String(row.deployment_authorization_id),
    executionId: String(row.execution_id),
    source: 'access-path-readiness',
    surface: 'browser-desktop',
    provenance: 'browser-observed',
    state: stateSchema.parse(row.state),
    payload: (row.payload || {}) as Record<string, unknown>,
    ...(row.analysis_kind === 'access-path-readiness' ? { analysisKind: 'access-path-readiness' as const } : {}),
    ...(row.analysis ? { analysis: row.analysis as Record<string, unknown> } : {}),
    ...(row.model ? { model: String(row.model) } : {}),
    evidenceRecordedAt: iso(row.evidence_recorded_at),
    ...(row.analyzed_at ? { analyzedAt: iso(row.analyzed_at) } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function recordAccessPathReadinessEvidence(input: {
  ownerId: string;
  labInstanceId: string;
  deploymentAuthorizationId: string;
  executionId: string;
  payload: Record<string, unknown>;
}) {
  const inserted = await getPool().query(
    `INSERT INTO execution_evidence (
       owner_id, lab_instance_id, deployment_authorization_id, execution_id,
       source, surface, provenance, state, payload, evidence_recorded_at
     ) VALUES (
       $1,$2,$3,$4,'access-path-readiness','browser-desktop','browser-observed',
       'evidence_recorded',$5::jsonb,NOW()
     )
     ON CONFLICT (owner_id, execution_id) DO NOTHING
     RETURNING *`,
    [
      input.ownerId,
      input.labInstanceId,
      input.deploymentAuthorizationId,
      input.executionId,
      JSON.stringify(input.payload),
    ]
  );

  if (inserted.rows[0]) return mapRow(inserted.rows[0]);

  const existing = await getPool().query(
    `SELECT *
       FROM execution_evidence
      WHERE owner_id=$1 AND execution_id=$2
      LIMIT 1`,
    [input.ownerId, input.executionId]
  );
  const row = existing.rows[0];
  if (!row) {
    throw new AccessPathReadinessEvidenceConflictError(
      'Access-path evidence could not resolve the existing execution claim.',
      'ACCESS_PATH_EXECUTION_CONFLICT'
    );
  }
  if (
    String(row.lab_instance_id) !== input.labInstanceId ||
    String(row.deployment_authorization_id) !== input.deploymentAuthorizationId
  ) {
    throw new AccessPathReadinessEvidenceConflictError(
      'The access-path execution claim was already used by a different runtime binding.',
      'ACCESS_PATH_EXECUTION_REUSED'
    );
  }
  return mapRow(row);
}

export async function getAccessPathReadinessEvidence(input: {
  ownerId: string;
  labInstanceId: string;
  evidenceId?: string;
}) {
  const params: unknown[] = [input.ownerId, input.labInstanceId];
  const evidenceClause = input.evidenceId ? 'AND id=$3' : '';
  if (input.evidenceId) params.push(input.evidenceId);

  const result = await getPool().query(
    `SELECT *
       FROM execution_evidence
      WHERE owner_id=$1
        AND lab_instance_id=$2
        AND source='access-path-readiness'
        AND surface='browser-desktop'
        AND provenance='browser-observed'
        AND state IN ('evidence_recorded','analyzed')
        ${evidenceClause}
      ORDER BY evidence_recorded_at DESC, created_at DESC
      LIMIT 1`,
    params
  );

  if (!result.rows[0]) {
    throw new AccessPathReadinessEvidenceConflictError(
      'No browser desktop access-path evidence is available for this lab.',
      'ACCESS_PATH_EVIDENCE_NOT_FOUND'
    );
  }
  return mapRow(result.rows[0]);
}

export async function storeAccessPathReadinessAnalysis(input: {
  ownerId: string;
  evidenceId: string;
  analysis: Record<string, unknown>;
  model: string;
}) {
  return transaction(async (client) => {
    const locked = await client.query(
      `SELECT *
         FROM execution_evidence
        WHERE id=$1
          AND owner_id=$2
          AND source='access-path-readiness'
          AND surface='browser-desktop'
          AND provenance='browser-observed'
        FOR UPDATE`,
      [input.evidenceId, input.ownerId]
    );
    const row = locked.rows[0];
    if (!row) {
      throw new AccessPathReadinessEvidenceConflictError(
        'Access-path readiness evidence was not found.',
        'ACCESS_PATH_EVIDENCE_NOT_FOUND'
      );
    }

    if (row.state === 'analyzed') {
      if (row.analysis_kind !== 'access-path-readiness' || !row.analysis) {
        throw new AccessPathReadinessEvidenceConflictError(
          'Access-path evidence was already analyzed by another surface.',
          'ACCESS_PATH_ALREADY_ANALYZED'
        );
      }
      return mapRow(row);
    }
    if (row.state !== 'evidence_recorded') {
      throw new AccessPathReadinessEvidenceConflictError(
        'Access-path evidence is not ready for analysis.',
        'ACCESS_PATH_NOT_READY'
      );
    }

    const updated = await client.query(
      `UPDATE execution_evidence
          SET state='analyzed',
              analysis_kind='access-path-readiness',
              analysis=$1::jsonb,
              model=$2,
              analyzed_at=NOW(),
              updated_at=NOW()
        WHERE id=$3
          AND owner_id=$4
          AND state='evidence_recorded'
        RETURNING *`,
      [JSON.stringify(input.analysis), input.model, input.evidenceId, input.ownerId]
    );

    if (updated.rows[0]) return mapRow(updated.rows[0]);

    const winner = await client.query(
      `SELECT * FROM execution_evidence WHERE id=$1 AND owner_id=$2 LIMIT 1`,
      [input.evidenceId, input.ownerId]
    );
    if (winner.rows[0]?.state === 'analyzed' && winner.rows[0]?.analysis_kind === 'access-path-readiness') {
      return mapRow(winner.rows[0]);
    }
    throw new AccessPathReadinessEvidenceConflictError(
      'Access-path evidence was analyzed by another request.',
      'ACCESS_PATH_ALREADY_ANALYZED'
    );
  });
}
