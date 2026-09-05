'use client';

import type { LabDefinition, LabInstanceStatus, LabRuntimeCapabilities } from './types';

const LABS_ENDPOINT = '/api/labs';
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

let cachedResult: LabsSnapshotResult | null = null;
let cachedUntil = 0;
let inFlight: Promise<LabsSnapshotResult> | null = null;
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

export function invalidateLabsSnapshot(): void {
  generation += 1;
  cachedResult = null;
  cachedUntil = 0;
  inFlight = null;
}

export async function getLabsSnapshot(options: { force?: boolean } = {}): Promise<LabsSnapshotResult> {
  if (!options.force && cachedResult && Date.now() < cachedUntil) return cachedResult;
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
