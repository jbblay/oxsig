import 'server-only';

import type { Pool } from 'pg';
import {
  getOperation,
  operationHasAutomatedRuntime,
  type OperationMode,
  type OperationRuntimeDriver,
} from '@/lib/operations/catalog';
import { OperationRuntimeError, provisionOperationRun } from '@/lib/operations/runtime';
import { provisionPreparedBlackDomainRun } from '@/lib/operations/prepared-runtime';

export { OperationRuntimeError } from '@/lib/operations/runtime';

export type OperationProvisionArgs = {
  pool: Pool;
  ownerId: string;
  slug: string;
  mode: OperationMode;
};

type OperationProvisionResult =
  | Awaited<ReturnType<typeof provisionPreparedBlackDomainRun>>
  | Awaited<ReturnType<typeof provisionOperationRun>>;

type OperationProvisioner = (args: OperationProvisionArgs) => Promise<OperationProvisionResult>;

const awsLabsEnabled = process.env.LAB_AWS_ENABLED === 'true';
const preparedBlackDomainEnabled = awsLabsEnabled
  && process.env.LAB_AWS_BLACK_DOMAIN_PREPARED === 'true';

async function preparedPoolRequiresFallback(pool: Pool) {
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS total_count,
       COUNT(*) FILTER (WHERE status='available')::int AS available_count,
       COUNT(*) FILTER (WHERE status IN ('failed','maintenance'))::int AS maintenance_count
     FROM operation_environments
     WHERE operation_slug='black-domain'`,
  );
  const summary = result.rows[0] || {};
  const total = Number(summary.total_count || 0);
  const available = Number(summary.available_count || 0);
  const maintenance = Number(summary.maintenance_count || 0);
  return total > 0 && available === 0 && maintenance === total;
}

function isPreparedUnavailable(error: unknown) {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: unknown }).code === 'OPERATION_ENVIRONMENT_UNAVAILABLE',
  );
}

/**
 * Black Domain prefers the prepared reusable pool for fast startup. A pool that
 * is explicitly quarantined/under maintenance must not become a product-wide
 * outage, so the existing disposable runtime is retained as a controlled
 * fallback. Busy or resetting prepared capacity still fails closed instead of
 * silently creating extra compute.
 */
const blackDomainProvisioner: OperationProvisioner = async (args) => {
  if (!awsLabsEnabled) {
    throw new OperationRuntimeError(
      'AWS lab provisioning is disabled on this deployment.',
      503,
      'OPERATION_AWS_DISABLED',
    );
  }

  if (!preparedBlackDomainEnabled) {
    return provisionOperationRun(args);
  }

  if (await preparedPoolRequiresFallback(args.pool)) {
    return provisionOperationRun(args);
  }

  try {
    return await provisionPreparedBlackDomainRun(args);
  } catch (error) {
    // Covers the narrow race where the slot becomes unavailable after the
    // pool-health read but before its reservation transaction completes.
    if (isPreparedUnavailable(error)) {
      return provisionOperationRun(args);
    }
    throw error;
  }
};

const runtimeDrivers: Record<OperationRuntimeDriver, OperationProvisioner> = {
  'black-domain-v1': blackDomainProvisioner,
};

export function getOperationRuntimeDriver(slug: string) {
  const operation = getOperation(slug);
  if (!operation) {
    throw new OperationRuntimeError('Operation not found.', 404, 'OPERATION_NOT_FOUND');
  }
  if (!operationHasAutomatedRuntime(operation) || !operation.runtime) {
    throw new OperationRuntimeError(
      'This Operation does not have an automated runtime yet.',
      409,
      'OPERATION_RUNTIME_NOT_AUTOMATED',
    );
  }

  const provision = runtimeDrivers[operation.runtime.driver];
  if (!provision) {
    throw new OperationRuntimeError(
      'The configured Operation runtime driver is unavailable.',
      503,
      'OPERATION_RUNTIME_DRIVER_UNAVAILABLE',
    );
  }
  return { operation, provision };
}

export async function provisionRegisteredOperationRun(args: OperationProvisionArgs) {
  const { operation, provision } = getOperationRuntimeDriver(args.slug);
  if (!operation.modes.includes(args.mode)) {
    throw new OperationRuntimeError(
      'This Operation does not support the requested mode.',
      400,
      'OPERATION_MODE_UNSUPPORTED',
    );
  }
  return provision(args);
}
