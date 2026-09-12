import 'server-only';

import type { LabRuntimeCapabilities } from './types';

const STATUS_STALE_AFTER_MS = 60_000;

type FreshnessRow = {
  runtime_observed_at?: string | Date | null;
  reconciliation_warning?: string | null;
};

export type LabStatusFreshness = {
  observedAt: string | null;
  stale: boolean;
  reconciliationWarning: string | null;
};

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function configuredRegion() {
  return process.env.LAB_AWS_REGION || process.env.AWS_REGION || 'eu-central-1';
}

/**
 * Fast deployment read model. This intentionally answers configuration only;
 * provider reachability remains an authoritative launch/reconciliation concern.
 * Environment changes become visible with the deployment/process that carries them,
 * so no stale capability cache can survive a configuration rollout.
 */
export function getConfiguredLabCapabilities(): LabRuntimeCapabilities & { reason?: string; region?: string } {
  const region = configuredRegion();
  if (process.env.LAB_AWS_ENABLED !== 'true') {
    return {
      provider: 'unconfigured',
      configured: false,
      supportsContainers: false,
      supportsVMs: false,
      supportsTerminal: false,
      supportsReset: false,
      region,
      reason: 'AWS lab provisioning is disabled for this deployment.',
    };
  }

  const subnetId = process.env.LAB_AWS_SUBNET_ID;
  const securityGroupId = process.env.LAB_AWS_SECURITY_GROUP_ID;
  const instanceProfile = process.env.LAB_AWS_INSTANCE_PROFILE;
  if (!subnetId || !securityGroupId) {
    return {
      provider: 'unconfigured',
      configured: false,
      supportsContainers: false,
      supportsVMs: false,
      supportsTerminal: false,
      supportsReset: false,
      region,
      reason: 'AWS lab subnet and security-group configuration is incomplete.',
    };
  }

  return {
    provider: 'aws-ec2',
    configured: true,
    supportsContainers: false,
    supportsVMs: true,
    supportsTerminal: Boolean(instanceProfile),
    supportsReset: false,
    region,
    reason: instanceProfile
      ? undefined
      : 'VM lifecycle is configured. Browser command execution requires an SSM instance profile.',
  };
}

export function labStatusFreshness(
  row: FreshnessRow,
  now = Date.now()
): LabStatusFreshness {
  const observedAt = toIso(row.runtime_observed_at);
  const warning = typeof row.reconciliation_warning === 'string' && row.reconciliation_warning.trim()
    ? row.reconciliation_warning.trim()
    : null;
  const observedTime = observedAt ? Date.parse(observedAt) : Number.NaN;
  const stale = Boolean(
    warning ||
    !Number.isFinite(observedTime) ||
    observedTime > now + STATUS_STALE_AFTER_MS ||
    now - observedTime > STATUS_STALE_AFTER_MS
  );

  return {
    observedAt,
    stale,
    reconciliationWarning: warning,
  };
}
