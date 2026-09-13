import 'server-only';

import type { Pool } from 'pg';

const READINESS_VERSION = 1;

type NodeMetadata = {
  bootstrapReadyAt?: string;
  readinessReason?: string;
  readinessError?: string;
  [key: string]: unknown;
};

export class OperationRunReadError extends Error {
  constructor(message: string, readonly status = 404, readonly code = 'OPERATION_RUN_NOT_FOUND') {
    super(message);
    this.name = 'OperationRunReadError';
  }
}

function metadataObject(value: unknown): NodeMetadata {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as NodeMetadata;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as NodeMetadata;
    } catch {}
  }
  return {};
}

function publicOperationMetadata(value: unknown) {
  const metadata = metadataObject(value);
  const safe = { ...metadata } as Record<string, unknown>;
  const rawAccess = safe.initialAccess;
  if (rawAccess && typeof rawAccess === 'object' && !Array.isArray(rawAccess)) {
    const access = rawAccess as Record<string, unknown>;
    const username = typeof access.username === 'string' ? access.username : undefined;
    const available = typeof access.passwordSecret === 'string' || typeof access.password === 'string';
    safe.initialAccess = {
      ...(username ? { username } : {}),
      available,
    };
  }
  return safe;
}

function durableComputeStatus(status: string) {
  if (status === 'running') return 'running';
  if (status === 'destroyed') return 'destroyed';
  if (status === 'failed') return 'failed';
  if (status === 'destroying') return 'destroying';
  return 'provisioning';
}

/**
 * Learner-facing Operation reads are deliberately database-only. Provider state
 * reconciliation belongs to an explicit control-plane request, not an ordinary
 * GET that may be repeated by several mounted UI surfaces.
 */
export async function getLearnerOperationRun(args: { pool: Pool; runId: string; ownerId: string }) {
  const runResult = await args.pool.query(
    `SELECT id,operation_slug,mode,status,operator_lab_instance_id,expires_at,metadata,last_error
       FROM operation_runs
      WHERE id=$1 AND owner_id=$2
      LIMIT 1`,
    [args.runId, args.ownerId],
  );
  const run = runResult.rows[0];
  if (!run) throw new OperationRunReadError('Operation run not found.');

  const nodeResult = await args.pool.query(
    `SELECT id,node_key,label,role,os_family,status,private_ip::text,lab_instance_id,metadata,last_error
       FROM operation_nodes
      WHERE run_id=$1
      ORDER BY CASE role WHEN 'operator' THEN 0 WHEN 'target' THEN 1 ELSE 2 END,node_key`,
    [args.runId],
  );

  const runMetadata = metadataObject(run.metadata);
  const readinessRequired = Number(runMetadata.readinessVersion || 0) >= READINESS_VERSION;
  const nodes = nodeResult.rows.map((node) => {
    const status = String(node.status || 'provisioning');
    const metadata = metadataObject(node.metadata);
    const knownReady = status === 'running' || Boolean(metadata.bootstrapReadyAt);
    const readiness = !readinessRequired
      ? 'legacy'
      : ['destroyed', 'failed', 'destroying'].includes(status)
        ? 'unavailable'
        : knownReady
          ? 'ready'
          : typeof metadata.readinessReason === 'string'
            ? metadata.readinessReason
            : 'bootstrapping';

    return {
      id: node.id,
      key: node.node_key,
      label: node.label,
      role: node.role,
      osFamily: node.os_family,
      status,
      computeStatus: durableComputeStatus(status),
      readiness,
      readinessError: typeof metadata.readinessError === 'string' ? metadata.readinessError : null,
      privateIp: node.private_ip || null,
      labInstanceId: node.lab_instance_id || null,
      lastError: node.last_error || null,
    };
  });

  return {
    id: run.id,
    operationSlug: run.operation_slug,
    mode: run.mode,
    status: run.status,
    operatorLabInstanceId: run.operator_lab_instance_id,
    expiresAt: run.expires_at,
    metadata: publicOperationMetadata(run.metadata),
    lastError: run.last_error || null,
    nodes,
  };
}
