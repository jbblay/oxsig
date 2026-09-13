import 'server-only';

import type { Pool } from 'pg';
import {
  getOperation,
  operationHasAutomatedRuntime,
  type OperationMode,
  type OperationRuntimeDriver,
} from '@/lib/operations/catalog';
import { OperationRuntimeError } from '@/lib/operations/runtime';
import { provisionPreparedBlackDomainRun } from '@/lib/operations/prepared-runtime';

export { OperationRuntimeError } from '@/lib/operations/runtime';

export type OperationProvisionArgs = {
  pool: Pool;
  ownerId: string;
  slug: string;
  mode: OperationMode;
};

type OperationProvisioner = (args: OperationProvisionArgs) => ReturnType<typeof provisionPreparedBlackDomainRun>;

const preparedBlackDomainEnabled = process.env.LAB_AWS_ENABLED === 'true'
  && process.env.LAB_AWS_BLACK_DOMAIN_PREPARED === 'true';

const disabledBlackDomainProvisioner: OperationProvisioner = async () => {
  throw new OperationRuntimeError(
    'Black Domain is disabled until AWS labs and the prepared reusable environment are enabled for this deployment.',
    503,
    'OPERATION_PREPARED_ENVIRONMENT_DISABLED',
  );
};

// Black Domain is intentionally fail-closed. If the prepared environment flag is
// missing or false, never fall back to the legacy disposable three-instance path.
const blackDomainProvisioner: OperationProvisioner = preparedBlackDomainEnabled
  ? provisionPreparedBlackDomainRun
  : disabledBlackDomainProvisioner;

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
