'use client';

import { getCsrfToken } from '@/lib/security/csrf-client';
import { EMPTY_LAB_TOPOLOGY, labTopologySchema, type LabTopology } from '@/lib/labs/topology-schema';

export const LEGACY_LAB_TOPOLOGY_KEY = 'oxsig:cyber-lab-topology:v1';

const RETRYABLE_STATUSES = new Set([408, 429]);
const MAX_SAVE_ATTEMPTS = 3;

type StorageLike = Pick<Storage, 'getItem' | 'removeItem'>;
type FetchLike = typeof fetch;
type CsrfTokenLoader = () => Promise<string>;
type Sleep = (ms: number) => Promise<void>;

type ClientDependencies = {
  fetchImpl?: FetchLike;
  storage?: StorageLike;
  csrfTokenLoader?: CsrfTokenLoader;
  sleep?: Sleep;
};

export class LabTopologyPersistenceError extends Error {
  constructor(message: string, readonly status: number | null, readonly retryable: boolean) {
    super(message);
    this.name = 'LabTopologyPersistenceError';
  }
}

function browserStorage(): StorageLike {
  if (typeof window === 'undefined') {
    throw new LabTopologyPersistenceError('Cyber Lab topology storage is only available in the browser', null, false);
  }
  return window.localStorage;
}

function isRetryableStatus(status: number) {
  return RETRYABLE_STATUSES.has(status) || status >= 500;
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === 'string' && body.error.trim() ? body.error : fallback;
}

function parseTopology(value: unknown, source: string): LabTopology {
  const parsed = labTopologySchema.safeParse(value);
  if (!parsed.success) {
    throw new LabTopologyPersistenceError(`${source} contains an invalid Cyber Lab topology`, null, false);
  }
  return parsed.data;
}

function parseLegacyTopology(raw: string): LabTopology {
  try {
    return parseTopology(JSON.parse(raw), 'Legacy browser state');
  } catch (error) {
    if (error instanceof LabTopologyPersistenceError) throw error;
    throw new LabTopologyPersistenceError('Legacy browser state contains an invalid Cyber Lab topology', null, false);
  }
}

function resolvedDependencies(dependencies: ClientDependencies = {}) {
  return {
    fetchImpl: dependencies.fetchImpl ?? fetch,
    storage: dependencies.storage ?? browserStorage(),
    csrfTokenLoader: dependencies.csrfTokenLoader ?? getCsrfToken,
    sleep: dependencies.sleep ?? ((ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))),
  };
}

async function putTopology(topology: LabTopology, dependencies: ClientDependencies = {}) {
  const parsed = labTopologySchema.safeParse(topology);
  if (!parsed.success) {
    throw new LabTopologyPersistenceError('Refusing to persist an invalid Cyber Lab topology', null, false);
  }

  const { fetchImpl, csrfTokenLoader, sleep } = resolvedDependencies(dependencies);
  const csrf = await csrfTokenLoader();
  let lastError: LabTopologyPersistenceError | null = null;

  for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl('/api/labs/topology', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify(parsed.data),
      });
      if (response.ok) {
        const body = await response.json().catch(() => ({})) as { topology?: unknown };
        return body.topology === undefined ? parsed.data : parseTopology(body.topology, 'Saved server state');
      }

      const retryable = isRetryableStatus(response.status);
      lastError = new LabTopologyPersistenceError(
        await responseError(response, 'Cyber Lab topology could not be saved'),
        response.status,
        retryable
      );
      if (!retryable || attempt === MAX_SAVE_ATTEMPTS) throw lastError;
    } catch (error) {
      if (error instanceof LabTopologyPersistenceError) {
        if (!error.retryable || attempt === MAX_SAVE_ATTEMPTS) throw error;
        lastError = error;
      } else {
        lastError = new LabTopologyPersistenceError(
          error instanceof Error ? error.message : 'Cyber Lab topology network request failed',
          null,
          true
        );
        if (attempt === MAX_SAVE_ATTEMPTS) throw lastError;
      }
    }

    await sleep(attempt * 500);
  }

  throw lastError ?? new LabTopologyPersistenceError('Cyber Lab topology could not be saved', null, true);
}

export async function loadDurableLabTopology(dependencies: ClientDependencies = {}): Promise<LabTopology> {
  const { fetchImpl, storage } = resolvedDependencies(dependencies);
  let response: Response;
  try {
    response = await fetchImpl('/api/labs/topology', { cache: 'no-store' });
  } catch (error) {
    throw new LabTopologyPersistenceError(
      error instanceof Error ? error.message : 'Cyber Lab topology could not be loaded',
      null,
      true
    );
  }

  if (!response.ok) {
    throw new LabTopologyPersistenceError(
      await responseError(response, 'Cyber Lab topology could not be loaded'),
      response.status,
      isRetryableStatus(response.status)
    );
  }

  const body = await response.json().catch(() => ({})) as { topology?: unknown };
  if (body.topology !== null && body.topology !== undefined) {
    const topology = parseTopology(body.topology, 'Saved server state');
    storage.removeItem(LEGACY_LAB_TOPOLOGY_KEY);
    return topology;
  }

  const legacyRaw = storage.getItem(LEGACY_LAB_TOPOLOGY_KEY);
  if (!legacyRaw) return EMPTY_LAB_TOPOLOGY;

  const legacy = parseLegacyTopology(legacyRaw);
  const saved = await putTopology(legacy, dependencies);
  storage.removeItem(LEGACY_LAB_TOPOLOGY_KEY);
  return saved;
}

export async function saveDurableLabTopology(topology: LabTopology, dependencies: ClientDependencies = {}) {
  return putTopology(topology, dependencies);
}
