import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { transaction } from '@/lib/db/pool';
import { sanitizePostgresText, stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { ExecutionEvidenceConflictError } from './server';

const AUTHORIZATION_TTL_SECONDS = 120;
const EXECUTION_TTL_SECONDS = 90;

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
    operationRunId: String(row.operation_run_id),
    operationNodeId: String(row.operation_node_id),
    command: String(row.command || ''),
    stdout: String(row.stdout || ''),
    stderr: String(row.stderr || ''),
    exitCode: row.exit_code === null || row.exit_code === undefined ? undefined : Number(row.exit_code),
    risk: payload.risk === 'changes-system' ? 'changes-system' as const : 'read-only' as const,
    provenance: 'browser-observed' as const,
    surface: 'ai-practitioner' as const,
    executionReceiptId: typeof payload.executionReceiptId === 'string' ? payload.executionReceiptId : undefined,
    terminalSessionId: typeof payload.terminalSessionId === 'string' ? payload.terminalSessionId : undefined,
    expiresAt: iso(row.expires_at),
  };
}

async function expireReceipts(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, any>[] }> },
  ownerId: string,
  runId: string,
  nodeId: string
) {
  await client.query(
    `UPDATE execution_evidence
        SET state='expired', updated_at=NOW()
      WHERE owner_id=$1
        AND operation_run_id=$2
        AND operation_node_id=$3
        AND source='interactive-terminal'
        AND state IN ('authorized','executing')
        AND expires_at <= NOW()`,
    [ownerId, runId, nodeId]
  );
}

export async function authorizeOperationTerminalEvidence(input: {
  ownerId: string;
  runId: string;
  nodeId: string;
  command: string;
  metadata?: Record<string, unknown>;
}) {
  const command = sanitizePostgresText(input.command.trim());
  const hash = commandHash(command);
  const executionId = randomUUID();

  return transaction(async (client) => {
    await expireReceipts(client, input.ownerId, input.runId, input.nodeId);
    await client.query(
      `UPDATE execution_evidence
          SET state='expired', updated_at=NOW()
        WHERE owner_id=$1
          AND operation_run_id=$2
          AND operation_node_id=$3
          AND source='interactive-terminal'
          AND command_hash=$4
          AND state IN ('authorized','executing')`,
      [input.ownerId, input.runId, input.nodeId, hash]
    );

    const result = await client.query(
      `INSERT INTO execution_evidence (
         owner_id, operation_run_id, operation_node_id, execution_id,
         source, surface, provenance, state, command_hash, command, payload, expires_at
       ) VALUES (
         $1,$2,$3,$4,'interactive-terminal','ai-practitioner','browser-observed',
         'authorized',$5,$6,$7::jsonb,NOW() + ($8 * INTERVAL '1 second')
       )
       RETURNING *`,
      [
        input.ownerId,
        input.runId,
        input.nodeId,
        executionId,
        hash,
        command,
        stringifyPostgresJson({
          ...input.metadata,
          operationRunId: input.runId,
          operationNodeId: input.nodeId,
          executionMode: 'interactive-terminal',
          surface: 'ai-practitioner',
        }),
        AUTHORIZATION_TTL_SECONDS,
      ]
    );
    return mapRow(result.rows[0]);
  });
}

export async function beginBoundOperationTerminalExecution(input: {
  ownerId: string;
  runId: string;
  nodeId: string;
  executionId: string;
  command: string;
  terminalSessionId: string;
  target: string;
}) {
  const command = sanitizePostgresText(input.command.trim());
  const hash = commandHash(command);
  const executionReceiptId = randomUUID();

  return transaction(async (client) => {
    await expireReceipts(client, input.ownerId, input.runId, input.nodeId);
    const locked = await client.query(
      `SELECT *
         FROM execution_evidence
        WHERE owner_id=$1
          AND operation_run_id=$2
          AND operation_node_id=$3
          AND execution_id=$4
          AND source='interactive-terminal'
          AND surface='ai-practitioner'
          AND command_hash=$5
          AND state='authorized'
          AND expires_at > NOW()
        LIMIT 1
        FOR UPDATE`,
      [input.ownerId, input.runId, input.nodeId, input.executionId, hash]
    );
    const row = locked.rows[0];
    if (!row) {
      throw new ExecutionEvidenceConflictError(
        'No active authorized execution receipt matches this Operation terminal run.',
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
      operationRunId: input.runId,
      operationNodeId: input.nodeId,
      executionReceiptIssuedAt: new Date().toISOString(),
    };
    const started = await client.query(
      `UPDATE execution_evidence
          SET state='executing',
              execution_started_at=NOW(),
              expires_at=NOW() + ($1 * INTERVAL '1 second'),
              payload=COALESCE(payload, '{}'::jsonb) || $2::jsonb,
              updated_at=NOW()
        WHERE id=$3 AND owner_id=$4 AND state='authorized'
        RETURNING *`,
      [EXECUTION_TTL_SECONDS, stringifyPostgresJson(binding), row.id, input.ownerId]
    );
    if (!started.rows[0]) {
      throw new ExecutionEvidenceConflictError(
        'The execution receipt was consumed by another request.',
        'EXECUTION_RECEIPT_CONSUMED'
      );
    }
    return { ...mapRow(started.rows[0]), executionReceiptId, terminalSessionId: binding.terminalSessionId };
  });
}

export async function recordBoundOperationTerminalEvidence(input: {
  ownerId: string;
  runId: string;
  nodeId: string;
  executionId: string;
  executionReceiptId: string;
  terminalSessionId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}) {
  const command = sanitizePostgresText(input.command.trim());
  const hash = commandHash(command);
  const sessionId = sanitizePostgresText(input.terminalSessionId);

  return transaction(async (client) => {
    const locked = await client.query(
      `SELECT *
         FROM execution_evidence
        WHERE owner_id=$1
          AND operation_run_id=$2
          AND operation_node_id=$3
          AND execution_id=$4
          AND source='interactive-terminal'
          AND surface='ai-practitioner'
          AND command_hash=$5
        LIMIT 1
        FOR UPDATE`,
      [input.ownerId, input.runId, input.nodeId, input.executionId, hash]
    );
    const row = locked.rows[0];
    if (!row) {
      throw new ExecutionEvidenceConflictError(
        'No execution evidence record matches this Operation receipt and terminal run.',
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
        'The one-time execution receipt does not match this Operation run.',
        'EXECUTION_RECEIPT_MISMATCH'
      );
    }
    if (payload.terminalSessionId !== sessionId) {
      throw new ExecutionEvidenceConflictError(
        'The terminal session does not match the bound execution receipt.',
        'EXECUTION_SESSION_MISMATCH'
      );
    }
    if (payload.operationRunId !== input.runId || payload.operationNodeId !== input.nodeId) {
      throw new ExecutionEvidenceConflictError(
        'The execution receipt belongs to a different Operation machine.',
        'EXECUTION_OPERATION_TARGET_MISMATCH'
      );
    }

    if (row.state === 'evidence_recorded' || row.state === 'analyzed') return mapRow(row);
    if (row.state !== 'executing') {
      throw new ExecutionEvidenceConflictError(
        'The execution receipt is not in an executable state.',
        'EXECUTION_RECEIPT_NOT_ACTIVE'
      );
    }
    if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE execution_evidence SET state='expired', updated_at=NOW()
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
          SET state='evidence_recorded', stdout=$1, stderr=$2, exit_code=$3,
              evidence_recorded_at=NOW(), updated_at=NOW()
        WHERE id=$4 AND owner_id=$5 AND state='executing'
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
