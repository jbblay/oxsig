import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCsrfToken: vi.fn(),
}));

vi.mock('@/lib/security/csrf-client', () => ({
  getCsrfToken: mocks.getCsrfToken,
}));

import { getLabsSnapshot, invalidateLabsSnapshot, reconcileLabsStatus } from './client';

function labsResponse(id: string, status = 200, instanceStatus = 'running') {
  return new Response(JSON.stringify({
    catalog: [],
    capabilities: { provider: 'unconfigured', configured: false, supportsContainers: false, supportsVMs: false, supportsTerminal: false, supportsReset: false },
    instances: [{
      id,
      slug: 'ubuntu',
      name: 'Ubuntu',
      status: instanceStatus,
      createdAt: '2026-09-05T00:00:00.000Z',
      expiresAt: '2026-09-05T01:00:00.000Z',
      observedAt: '2026-09-05T00:00:05.000Z',
      stale: false,
      reconciliationWarning: null,
    }],
  }), { status, headers: { 'content-type': 'application/json' } });
}

function managedProfileResponse(active: boolean) {
  return new Response(JSON.stringify({
    catalog: [
      {
        slug: 'ubuntu-security-lab',
        name: 'Ubuntu Security Lab',
        shortName: 'Ubuntu 24.04',
        category: 'Linux Security',
        description: 'Ubuntu lab',
        difficulty: 'beginner',
        runtime: 'vm',
        launchSurface: 'cyber-lab',
        osFamily: 'ubuntu',
        platform: 'linux',
        shell: 'bash',
        accessModes: ['terminal'],
        defaultAccessMode: 'terminal',
        defaultCommand: 'whoami',
        estimatedMemoryMb: 1024,
        estimatedCpu: 2,
        objectives: [],
        available: true,
      },
      {
        slug: 'operation-black-domain-operator',
        name: 'Black Domain Operator',
        shortName: 'Black Domain',
        category: 'Active Directory',
        description: 'Operation-managed lab',
        difficulty: 'advanced',
        runtime: 'vm',
        launchSurface: 'operation',
        osFamily: 'ubuntu',
        platform: 'linux',
        shell: 'bash',
        accessModes: ['terminal'],
        defaultAccessMode: 'terminal',
        defaultCommand: 'cat /opt/oxsig/operation.env',
        estimatedMemoryMb: 2048,
        estimatedCpu: 2,
        objectives: [],
        available: false,
        availabilityNote: 'This managed profile is launched only from Operations > Black Domain.',
      },
    ],
    capabilities: { provider: 'unconfigured', configured: false, supportsContainers: false, supportsVMs: false, supportsTerminal: false, supportsReset: false },
    instances: active ? [{
      id: 'black-domain-lab',
      slug: 'operation-black-domain-operator',
      name: 'Black Domain Operator',
      status: 'running',
      createdAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-17T02:00:00.000Z',
    }] : [],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function reconciliationResponse(status = 200) {
  return new Response(JSON.stringify({
    ok: true,
    checkedAt: '2026-09-12T08:00:00.000Z',
    reconciled: 1,
    failed: 0,
    skipped: false,
  }), { status, headers: { 'content-type': 'application/json' } });
}

describe('labs client cache', () => {
  beforeEach(() => {
    invalidateLabsSnapshot();
    mocks.getCsrfToken.mockClear();
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reuses a stable successful snapshot until it is explicitly invalidated', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(labsResponse('lab-1'));

    await expect(getLabsSnapshot()).resolves.toMatchObject({ ok: true, data: { instances: [{ id: 'lab-1' }] } });
    await expect(getLabsSnapshot()).resolves.toMatchObject({ ok: true, data: { instances: [{ id: 'lab-1' }] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-reads transitional snapshots so lifecycle progress can advance', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(labsResponse('lab-1', 200, 'provisioning'))
      .mockResolvedValueOnce(labsResponse('lab-1', 200, 'running'));

    await expect(getLabsSnapshot()).resolves.toMatchObject({ data: { instances: [{ status: 'provisioning' }] } });
    await expect(getLabsSnapshot()).resolves.toMatchObject({ data: { instances: [{ status: 'running' }] } });
    await expect(getLabsSnapshot()).resolves.toMatchObject({ data: { instances: [{ status: 'running' }] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not refresh a transitional snapshot while the browser tab is hidden', async () => {
    vi.stubGlobal('document', { visibilityState: 'visible' });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(labsResponse('lab-1', 200, 'provisioning'))
      .mockResolvedValueOnce(labsResponse('lab-1', 200, 'running'));

    await expect(getLabsSnapshot()).resolves.toMatchObject({ data: { instances: [{ status: 'provisioning' }] } });
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    await expect(getLabsSnapshot()).resolves.toMatchObject({ data: { instances: [{ status: 'provisioning' }] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.stubGlobal('document', { visibilityState: 'visible' });
    await expect(getLabsSnapshot()).resolves.toMatchObject({ data: { instances: [{ status: 'running' }] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent reads into one network request', async () => {
    let resolveResponse!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(pending);

    const first = getLabsSnapshot();
    const second = getLabsSnapshot();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse(labsResponse('lab-2'));
    await expect(first).resolves.toMatchObject({ data: { instances: [{ id: 'lab-2' }] } });
    await expect(second).resolves.toMatchObject({ data: { instances: [{ id: 'lab-2' }] } });
  });

  it('explicit invalidation forces a fresh read', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(labsResponse('lab-1'))
      .mockResolvedValueOnce(labsResponse('lab-2'));

    await getLabsSnapshot();
    invalidateLabsSnapshot();
    const refreshed = await getLabsSnapshot();

    expect(refreshed.data.instances?.[0]?.id).toBe('lab-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let an invalidated in-flight request repopulate the cache', async () => {
    let resolveFirst!: (response: Response) => void;
    const firstPending = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(firstPending)
      .mockResolvedValueOnce(labsResponse('lab-new'));

    const stale = getLabsSnapshot();
    invalidateLabsSnapshot();
    const fresh = getLabsSnapshot();
    resolveFirst(labsResponse('lab-stale'));

    await expect(stale).resolves.toMatchObject({ data: { instances: [{ id: 'lab-stale' }] } });
    await expect(fresh).resolves.toMatchObject({ data: { instances: [{ id: 'lab-new' }] } });
    await expect(getLabsSnapshot()).resolves.toMatchObject({ data: { instances: [{ id: 'lab-new' }] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache failed responses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'temporary failure' }), { status: 503 }))
      .mockResolvedValueOnce(labsResponse('lab-3'));

    await expect(getLabsSnapshot()).resolves.toMatchObject({ ok: false, status: 503 });
    await expect(getLabsSnapshot()).resolves.toMatchObject({ ok: true, data: { instances: [{ id: 'lab-3' }] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('hides operation-managed profiles from the normal Cyber Lab catalog until they are active', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(managedProfileResponse(false));

    const result = await getLabsSnapshot();

    expect(result.data.catalog?.map((lab) => lab.slug)).toEqual(['ubuntu-security-lab']);
  });

  it('exposes an active Black Domain operator with its Operations-specific explanation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(managedProfileResponse(true));

    const result = await getLabsSnapshot();
    const blackDomain = result.data.catalog?.find((lab) => lab.slug === 'operation-black-domain-operator');

    expect(blackDomain).toMatchObject({
      launchSurface: 'operation',
      available: false,
      availabilityNote: 'This managed profile is launched only from Operations > Black Domain.',
    });
  });

  it('force performs an explicit reconciliation before returning the persisted snapshot', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(labsResponse('lab-1'))
      .mockResolvedValueOnce(reconciliationResponse())
      .mockResolvedValueOnce(labsResponse('lab-2'));

    await getLabsSnapshot();
    const forced = await getLabsSnapshot({ force: true });

    expect(forced.data.instances?.[0]?.id).toBe('lab-2');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/labs/reconcile');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'x-csrf-token': 'csrf-token' },
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/labs');
  });

  it('coalesces concurrent explicit reconciliation requests', async () => {
    let resolveReconciliation!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveReconciliation = resolve; });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(pending);

    const first = reconcileLabsStatus();
    const second = reconcileLabsStatus();

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mocks.getCsrfToken).toHaveBeenCalledTimes(1);
    });

    resolveReconciliation(reconciliationResponse());
    await expect(first).resolves.toMatchObject({ ok: true, status: 200 });
    await expect(second).resolves.toMatchObject({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still returns the persisted snapshot when explicit reconciliation cannot be reached', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(labsResponse('lab-persisted'));

    const result = await getLabsSnapshot({ force: true });

    expect(result).toMatchObject({ ok: true, data: { instances: [{ id: 'lab-persisted' }] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
