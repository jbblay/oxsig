import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_LAB_TOPOLOGY_KEY,
  LabTopologyPersistenceError,
  loadDurableLabTopology,
  saveDurableLabTopology,
} from './topology-client';
import type { LabTopology } from './topology-schema';

const serverTopology: LabTopology = {
  nodes: [{
    id: 'machine-server',
    type: 'machine',
    position: { x: 10, y: 20 },
    data: { slug: 'ubuntu-security-lab', label: 'Ubuntu-01' },
  }],
  edges: [],
};

const legacyTopology: LabTopology = {
  nodes: [{
    id: 'machine-legacy',
    type: 'machine',
    position: { x: 30, y: 40 },
    data: { slug: 'ubuntu-security-lab', label: 'Legacy-01' },
  }],
  edges: [],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
}

describe('Cyber Lab durable topology client', () => {
  it('treats saved server topology as authoritative and clears the obsolete browser copy', async () => {
    const browser = storage({ [LEGACY_LAB_TOPOLOGY_KEY]: JSON.stringify(legacyTopology) });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ topology: serverTopology }));

    const topology = await loadDurableLabTopology({
      fetchImpl: fetchImpl as typeof fetch,
      storage: browser,
      csrfTokenLoader: vi.fn(),
    });

    expect(topology).toEqual(serverTopology);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('/api/labs/topology', { cache: 'no-store' });
    expect(browser.removeItem).toHaveBeenCalledWith(LEGACY_LAB_TOPOLOGY_KEY);
  });

  it('imports legacy browser topology only after the server confirms no durable topology exists', async () => {
    const browser = storage({ [LEGACY_LAB_TOPOLOGY_KEY]: JSON.stringify(legacyTopology) });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ topology: null }))
      .mockResolvedValueOnce(jsonResponse({ topology: legacyTopology }));
    const csrfTokenLoader = vi.fn().mockResolvedValue('csrf-token');

    const topology = await loadDurableLabTopology({
      fetchImpl: fetchImpl as typeof fetch,
      storage: browser,
      csrfTokenLoader,
      sleep: vi.fn(),
    });

    expect(topology).toEqual(legacyTopology);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/labs/topology');
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'csrf-token' },
      body: JSON.stringify(legacyTopology),
    });
    expect(browser.removeItem).toHaveBeenCalledWith(LEGACY_LAB_TOPOLOGY_KEY);
  });

  it('preserves legacy browser data when migration cannot be persisted', async () => {
    const browser = storage({ [LEGACY_LAB_TOPOLOGY_KEY]: JSON.stringify(legacyTopology) });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ topology: null }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Forbidden' }, 403));

    await expect(loadDurableLabTopology({
      fetchImpl: fetchImpl as typeof fetch,
      storage: browser,
      csrfTokenLoader: vi.fn().mockResolvedValue('csrf-token'),
      sleep: vi.fn(),
    })).rejects.toMatchObject({ status: 403, retryable: false });

    expect(browser.removeItem).not.toHaveBeenCalled();
  });

  it('never falls back to browser topology when the authoritative server read fails', async () => {
    const browser = storage({ [LEGACY_LAB_TOPOLOGY_KEY]: JSON.stringify(legacyTopology) });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'Unavailable' }, 503));

    await expect(loadDurableLabTopology({
      fetchImpl: fetchImpl as typeof fetch,
      storage: browser,
      csrfTokenLoader: vi.fn(),
    })).rejects.toBeInstanceOf(LabTopologyPersistenceError);

    expect(browser.getItem).not.toHaveBeenCalled();
    expect(browser.removeItem).not.toHaveBeenCalled();
  });

  it('retries transient direct saves and then returns the exact server-normalized topology', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Busy' }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'Slow down' }, 429))
      .mockResolvedValueOnce(jsonResponse({ topology: serverTopology }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const saved = await saveDurableLabTopology(serverTopology, {
      fetchImpl: fetchImpl as typeof fetch,
      storage: storage(),
      csrfTokenLoader: vi.fn().mockResolvedValue('csrf-token'),
      sleep,
    });

    expect(saved).toEqual(serverTopology);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 500);
    expect(sleep).toHaveBeenNthCalledWith(2, 1000);
  });
});
