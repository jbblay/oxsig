'use client';

import type { LabDefinition, LabInstanceStatus, LabRuntimeCapabilities } from './types';
import { getCsrfToken } from '@/lib/security/csrf-client';

const LABS_ENDPOINT = '/api/labs';
const LABS_RECONCILE_ENDPOINT = '/api/labs/reconcile';
const TRANSITIONAL_LAB_STATUSES = new Set<LabInstanceStatus>([
  'created',
  'provisioning',
  'stopping',
  'destroying',
  'resetting',
]);
const OPERATION_MANAGED_LAB_NOTES: Readonly<Record<string, string>> = {
  'operation-black-domain-operator': 'This managed profile is launched only from Operations > Black Domain.',
};

export type ClientLabInstance = {
  id: string;
  slug: string;
  name: string;
  status: LabInstanceStatus;
  lastError?: string;
  createdAt: string;
  startedAt?: string;
  expiresAt: string;
  observedAt?: string | null;
  stale?: boolean;
  reconciliationWarning?: string | null;
  metadata?: Record<string, unknown>;
};

export type LabsSnapshot = {
  catalog: LabDefinition[];
  capabilities: LabRuntimeCapabilities & { reason?: string; region?: string };
  instances: ClientLabInstance[];
  reconciliationWarning?: string | null;
};

export type LabsSnapshotBody = Partial<LabsSnapshot> & { error?: string };

export type LabsSnapshotResult = {
  ok: boolean;
  status: number;
  data: LabsSnapshotBody;
};

export type LabsReconciliationResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
};

let cachedResult: LabsSnapshotResult | null = null;
let inFlight: Promise<LabsSnapshotResult> | null = null;
let reconciliationInFlight: Promise<LabsReconciliationResult> | null = null;
let generation = 0;

function normalizeLabsSnapshotBody(data: LabsSnapshotBody): LabsSnapshotBody {
  if (!data.catalog?.length) return data;

  const activeSlugs = new Set((data.instances || []).map((instance) => instance.slug));
  const catalog = data.catalog
    .filter((lab) => !OPERATION_MANAGED_LAB_NOTES[lab.slug] || activeSlugs.has(lab.slug))
    .map((lab) => {
      const operationNote = OPERATION_MANAGED_LAB_NOTES[lab.slug];
      return operationNote ? { ...lab, availabilityNote: operationNote } : lab;
    });

  return { ...data, catalog };
}

function snapshotNeedsProgressRefresh(result: LabsSnapshotResult | null): boolean {
  if (!result?.ok) return false;
  return (result.data.instances || []).some((instance) => TRANSITIONAL_LAB_STATUSES.has(instance.status));
}

function canRefreshProgressFromThisDocument(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

async function requestLabsSnapshot(requestGeneration: number): Promise<LabsSnapshotResult> {
  const response = await fetch(LABS_ENDPOINT, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const rawData = await response.json().catch(() => ({})) as LabsSnapshotBody;
  const data = response.ok ? normalizeLabsSnapshotBody(rawData) : rawData;
  const result = { ok: response.ok, status: response.status, data };

  if (response.ok && requestGeneration === generation) {
    cachedResult = result;
  }

  return result;
}

async function requestLabsReconciliation(): Promise<LabsReconciliationResult> {
  const csrfToken = await getCsrfToken();
  const response = await fetch(LABS_RECONCILE_ENDPOINT, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'x-csrf-token': csrfToken,
    },
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;

  // A completed reconciliation attempt, including a handled provider failure,
  // may have persisted new freshness/warning metadata. Force the next read to DB.
  if (response.ok) invalidateLabsSnapshot();

  return { ok: response.ok, status: response.status, data };
}

export function invalidateLabsSnapshot(): void {
  generation += 1;
  cachedResult = null;
  inFlight = null;
}

export async function reconcileLabsStatus(): Promise<LabsReconciliationResult> {
  if (reconciliationInFlight) return reconciliationInFlight;

  const request = requestLabsReconciliation();
  reconciliationInFlight = request;
  try {
    return await request;
  } finally {
    if (reconciliationInFlight === request) reconciliationInFlight = null;
  }
}

export async function getLabsSnapshot(options: { force?: boolean } = {}): Promise<LabsSnapshotResult> {
  // Stable snapshots are event-driven: keep them until an explicit invalidation or
  // refresh. Transitional snapshots may refresh only while the document is visible.
  // Hidden/mobile-background tabs must never turn browser timer throttling into a
  // minute-by-minute API heartbeat.
  if (options.force) {
    try {
      await reconcileLabsStatus();
    } catch {
      // Provider/network refresh failure must never hide the persisted read model.
    }
  } else if (cachedResult) {
    const needsProgress = snapshotNeedsProgressRefresh(cachedResult);
    if (!needsProgress || !canRefreshProgressFromThisDocument()) return cachedResult;
  }

  if (inFlight) return inFlight;

  const requestGeneration = generation;
  const request = requestLabsSnapshot(requestGeneration);
  inFlight = request;

  try {
    return await request;
  } finally {
    if (inFlight === request) inFlight = null;
  }
}
