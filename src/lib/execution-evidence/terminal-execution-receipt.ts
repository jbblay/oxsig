import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { transaction } from '@/lib/db/pool';
import { sanitizePostgresText, stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { ExecutionEvidenceConflictError } from './server';

export type TerminalEvidenceSurface = 'ai-practitioner' | 'academy';

const TERMINAL_EXECUTION_TTL_SECONDS = 90;

function commandHash(command: string) {
  return createHash('sha256').update(command.trim(), 'utf8').digest('hex');
}

function iso(value: unknown) {
  return value ? new Date(String(value)).toISOString() : undefined;
}

function mapRow(row: Record<string, any>) {
  const payload = (row.payload || {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    executionId: String(row.execution_id),
    surface: String(row.surface) as TerminalEvidenceSurface,
    provenance: 'browser-observed' as const,
    state: String(row.state),
    command: String(row.command || ''),
    stdout: String(row.stdout || ''),
    stderr: String(row.stderr || ''),
    exitCode: row.exit_code === null || row.exit_code === undefined ? undefined : Number(row.exit_code),
    executionReceiptId: typeof payload.executionReceiptId === 'string' ? payload.executionReceiptId : undefined,
    terminalSessionId: typeof payload.terminalSessionId === 'string' ? payload.terminalSessionId : undefined,
    executionStartedAt: iso(row.execution_started_at),
    evidenceRecordedAt: iso(row.evidence_recorded_at),
    expiresAt: iso(row.expires_at),
  };
}

export async function beginBoundTerminalExecution(input: {
  ownerId: string;
  labInstanceId: string;
  executionId: string;
  surface: TerminalEvidenceSurface;
  command: string;
  terminalSessionId: string;
  target: string;
}) {
  const command = sanitizePostgresText(input.command.trim());
  const hash = commandHash(command);
  const executionReceiptId = randomUUID();

  return transaction(async (client) => {
    await client.query(
      `UPDATE execution_evidence
          SET state='expired', updated_at=NOW()
        WHERE owner_id=$1
          AND lab_instance_id=$2
          AND source='interactive-terminal'
          AND state IN ('authorized','executing')
          AND expires_at <= NOW()`,
      [input.ownerId, input.labInstanceId]
    );

    const locked = await client.query(
      `SELECT *
         FROM execution_evidence
        WHERE owner_id=$1
          AND lab_instance_id=$2
          AND execution_id=$3
          AND source='interactive-terminal'
          AND surface=$4
          AND command_hash=$5
          AND state='authorized'
          AND expires_at > NOW()
        LIMIT 1
        FOR UPDATE`,
      [input.ownerId, input.labInstanceId, input.executionId, input.surface, hash]
    );
    const row = locked.rows[0];
    if (!row) {
      throw new ExecutionEvidenceConflictError(
        'No active authorized execution receipt matches this terminal run.',
        'EXECUTION_RECEIPT_NOT_ACTIVE'
      );
    }
    if (String(row.command) !== command) {
      throw new ExecutionEvidenceConflictError(
        'The command no longer matches the authorized execution receipt.',
        'EXECUTION_COMMAND_MISMATCH'
      );
    }

    const binding = {
      executionReceiptId,
      terminalSessionId: sanitizePostgresText(input.terminalSessionId),
      terminalTarget: sanitizePostgresText(input.target),
      executionReceiptIssuedAt: new Date().toISOString(),
    };
    const started = await client.query(
      `UPDATE execution_evidence
          SET state='executing',
              execution_started_at=NOW(),
              expires_at=NOW() + ($1 * INTERVAL '1 second'),
              payload=COALESCE(payload, '{}'::jsonb) || $2::jsonb,
              updated_at=NOW()
        WHERE id=$3
          AND owner_id=$4
          AND state='authorized'
        RETURNING *`,
      [
        TERMINAL_EXECUTION_TTL_SECONDS,
        stringifyPostgresJson(binding),
        row.id,
        input.ownerId,
      ]
    );
    if (!started.rows[0]) {
      throw new ExecutionEvidenceConflictError(
        'The execution receipt was consumed by another request.',
        'EXECUTION_RECEIPT_CONSUMED'
      );
    }

    return {
      ...mapRow(started.rows[0]),
      executionReceiptId,
      terminalSessionId: binding.terminalSessionId,
    };
  });
}

export async function recordBoundTerminalEvidence(input: {
  ownerId: string;
  labInstanceId: string;
  executionId: string;
  executionReceiptId: string;
  terminalSessionId: string;
  surface: TerminalEvidenceSurface;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}) {
  const command = sanitizePostgresText(input.command.trim());
  const hash = commandHash(command);
  const terminalSessionId = sanitizePostgresText(input.terminalSessionId);

  return transaction(async (client) => {
    const locked = await client.query(
      `SELECT *
         FROM execution_evidence
        WHERE owner_id=$1
          AND lab_instance_id=$2
          AND execution_id=$3
          AND source='interactive-terminal'
          AND surface=$4
          AND command_hash=$5
        LIMIT 1
        FOR UPDATE`,
      [input.ownerId, input.labInstanceId, input.executionId, input.surface, hash]
    );
    const row = locked.rows[0];
    if (!row) {
      throw new ExecutionEvidenceConflictError(
        'No execution evidence record matches this receipt and terminal run.',
        'EXECUTION_RECEIPT_NOT_ACTIVE'
      );
    }
    if (String(row.command) !== command) {
      throw new ExecutionEvidenceConflictError(
        'The command no longer matches the authorized execution receipt.',
        'EXECUTION_COMMAND_MISMATCH'
      );
    }

    const payload = (row.payload || {}) as Record<string, unknown>;
    if (payload.executionReceiptId !== input.executionReceiptId) {
      throw new ExecutionEvidenceConflictError(
        'The one-time execution receipt does not match this run.',
        'EXECUTION_RECEIPT_MISMATCH'
      );
    }
    if (payload.terminalSessionId !== terminalSessionId) {
      throw new ExecutionEvidenceConflictError(
        'The terminal session does not match the bound execution receipt.',
        'EXECUTION_SESSION_MISMATCH'
      );
    }

    if (row.state === 'evidence_recorded' || row.state === 'analyzed') {
      return mapRow(row);
    }
    if (row.state !== 'executing') {
      throw new ExecutionEvidenceConflictError(
        'The execution receipt is not in an executable state.',
        'EXECUTION_RECEIPT_NOT_ACTIVE'
      );
    }
    if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE execution_evidence
            SET state='expired', updated_at=NOW()
          WHERE id=$1 AND owner_id=$2 AND state='executing'`,
        [row.id, input.ownerId]
      );
      throw new ExecutionEvidenceConflictError(
        'The one-time execution receipt expired before evidence was recorded.',
        'EXECUTION_RECEIPT_EXPIRED'
      );
    }

    const recorded = await client.query(
      `UPDATE execution_evidence
          SET state='evidence_recorded',
              stdout=$1,
              stderr=$2,
              exit_code=$3,
              evidence_recorded_at=NOW(),
              updated_at=NOW()
        WHERE id=$4
          AND owner_id=$5
          AND state='executing'
        RETURNING *`,
      [
        sanitizePostgresText(input.stdout),
        sanitizePostgresText(input.stderr),
        input.exitCode,
        row.id,
        input.ownerId,
      ]
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
