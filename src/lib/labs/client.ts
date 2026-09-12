'use client';

import type { LabDefinition, LabInstanceStatus, LabRuntimeCapabilities } from './types';
import { getCsrfToken } from '@/lib/security/csrf-client';

const LABS_ENDPOINT = '/api/labs';
const LABS_RECONCILE_ENDPOINT = '/api/labs/reconcile';
const LABS_CACHE_TTL_MS = 1000;

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
let cachedUntil = 0;
let inFlight: Promise<LabsSnapshotResult> | null = null;
let reconciliationInFlight: Promise<LabsReconciliationResult> | null = null;
let generation = 0;

async function requestLabsSnapshot(requestGeneration: number): Promise<LabsSnapshotResult> {
  const response = await fetch(LABS_ENDPOINT, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({})) as LabsSnapshotBody;
  const result = { ok: response.ok, status: response.status, data };

  if (response.ok && requestGeneration === generation) {
    cachedResult = result;
    cachedUntil = Date.now() + LABS_CACHE_TTL_MS;
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
  cachedUntil = 0;
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
  // `force` is the explicit refresh path. It may wait on provider reconciliation,
  // while the default ordinary read below remains a fast persisted snapshot.
  if (options.force) {
    try {
      await reconcileLabsStatus();
    } catch {
      // Provider/network refresh failure must never hide the persisted read model.
    }
  } else if (cachedResult && Date.now() < cachedUntil) {
    return cachedResult;
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
