import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPool, transaction } from '@/lib/db/pool';

const stateSchema = z.enum(['evidence_recorded', 'analyzed']);

export type GuestServiceReadinessEvidenceRecord = {
  id: string;
  ownerId: string;
  labInstanceId: string;
  deploymentAuthorizationId: string;
  executionId: string;
  source: 'guest-service-readiness';
  surface: 'infrastructure-designer';
  provenance: 'server-executed';
  state: 'evidence_recorded' | 'analyzed';
  payload: Record<string, unknown>;
  analysisKind?: 'guest-service-readiness';
  analysis?: Record<string, unknown>;
  model?: string;
  evidenceRecordedAt: string;
  analyzedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export class GuestServiceReadinessEvidenceConflictError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'GuestServiceReadinessEvidenceConflictError';
  }
}

function iso(value: unknown) {
  return new Date(String(value)).toISOString();
}

function mapRow(row: Record<string, any>): GuestServiceReadinessEvidenceRecord {
  if (
    row.source !== 'guest-service-readiness' ||
    row.surface !== 'infrastructure-designer' ||
    row.provenance !== 'server-executed'
  ) {
    throw new GuestServiceReadinessEvidenceConflictError(
      'Evidence does not belong to the guest-service readiness surface.',
      'GUEST_SERVICE_SURFACE_MISMATCH'
    );
  }

  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    labInstanceId: String(row.lab_instance_id),
    deploymentAuthorizationId: String(row.deployment_authorization_id),
    executionId: String(row.execution_id),
    source: 'guest-service-readiness',
    surface: 'infrastructure-designer',
    provenance: 'server-executed',
    state: stateSchema.parse(row.state),
    payload: (row.payload || {}) as Record<string, unknown>,
    ...(row.analysis_kind === 'guest-service-readiness' ? { analysisKind: 'guest-service-readiness' as const } : {}),
    ...(row.analysis ? { analysis: row.analysis as Record<string, unknown> } : {}),
    ...(row.model ? { model: String(row.model) } : {}),
    evidenceRecordedAt: iso(row.evidence_recorded_at),
    ...(row.analyzed_at ? { analyzedAt: iso(row.analyzed_at) } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function recordGuestServiceReadinessEvidence(input: {
  ownerId: string;
  labInstanceId: string;
  deploymentAuthorizationId: string;
  payload: Record<string, unknown>;
}) {
  const executionId = randomUUID();
  const result = await getPool().query(
    `INSERT INTO execution_evidence (
       owner_id, lab_instance_id, deployment_authorization_id, execution_id,
       source, surface, provenance, state, payload, evidence_recorded_at
     ) VALUES (
       $1,$2,$3,$4,'guest-service-readiness','infrastructure-designer','server-executed',
       'evidence_recorded',$5::jsonb,NOW()
     )
     RETURNING *`,
    [
      input.ownerId,
      input.labInstanceId,
      input.deploymentAuthorizationId,
      executionId,
      JSON.stringify(input.payload),
    ]
  );

  return mapRow(result.rows[0]);
}

export async function getGuestServiceReadinessEvidence(input: {
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
        AND source='guest-service-readiness'
        AND surface='infrastructure-designer'
        AND provenance='server-executed'
        AND state IN ('evidence_recorded','analyzed')
        ${evidenceClause}
      ORDER BY evidence_recorded_at DESC, created_at DESC
      LIMIT 1`,
    params
  );

  const row = result.rows[0];
  if (!row) {
    throw new GuestServiceReadinessEvidenceConflictError(
      'No guest-service readiness evidence is available for this lab.',
      'GUEST_SERVICE_EVIDENCE_NOT_FOUND'
    );
  }
  return mapRow(row);
}

export async function storeGuestServiceReadinessAnalysis(input: {
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
          AND source='guest-service-readiness'
          AND surface='infrastructure-designer'
          AND provenance='server-executed'
        FOR UPDATE`,
      [input.evidenceId, input.ownerId]
    );
    const row = locked.rows[0];
    if (!row) {
      throw new GuestServiceReadinessEvidenceConflictError(
        'Guest-service readiness evidence was not found.',
        'GUEST_SERVICE_EVIDENCE_NOT_FOUND'
      );
    }

    if (row.state === 'analyzed') {
      if (row.analysis_kind !== 'guest-service-readiness' || !row.analysis) {
        throw new GuestServiceReadinessEvidenceConflictError(
          'Guest-service evidence was already analyzed by another surface.',
          'GUEST_SERVICE_ALREADY_ANALYZED'
        );
      }
      return mapRow(row);
    }
    if (row.state !== 'evidence_recorded') {
      throw new GuestServiceReadinessEvidenceConflictError(
        'Guest-service evidence is not ready for analysis.',
        'GUEST_SERVICE_NOT_READY'
      );
    }

    const updated = await client.query(
      `UPDATE execution_evidence
          SET state='analyzed',
              analysis_kind='guest-service-readiness',
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

    if (!updated.rows[0]) {
      const winner = await client.query(
        `SELECT * FROM execution_evidence WHERE id=$1 AND owner_id=$2 LIMIT 1`,
        [input.evidenceId, input.ownerId]
      );
      if (winner.rows[0]?.state === 'analyzed' && winner.rows[0]?.analysis_kind === 'guest-service-readiness') {
        return mapRow(winner.rows[0]);
      }
      throw new GuestServiceReadinessEvidenceConflictError(
        'Guest-service evidence was analyzed by another request.',
        'GUEST_SERVICE_ALREADY_ANALYZED'
      );
    }

    return mapRow(updated.rows[0]);
  });
}
