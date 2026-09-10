import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLabsSnapshot, invalidateLabsSnapshot } from './client';

function labsResponse(id: string, status = 200) {
  return new Response(JSON.stringify({
    catalog: [],
    capabilities: { provider: 'unconfigured', configured: false, supportsContainers: false, supportsVMs: false, supportsTerminal: false, supportsReset: false },
    instances: [{ id, slug: 'ubuntu', name: 'Ubuntu', status: 'running', createdAt: '2026-09-05T00:00:00.000Z', expiresAt: '2026-09-05T01:00:00.000Z' }],
  }), { status, headers: { 'content-type': 'application/json' } });
}

describe('labs client cache', () => {
  beforeEach(() => {
    invalidateLabsSnapshot();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reuses a short-lived successful snapshot', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(labsResponse('lab-1'));

    await expect(getLabsSnapshot()).resolves.toMatchObject({ ok: true, data: { instances: [{ id: 'lab-1' }] } });
    await expect(getLabsSnapshot()).resolves.toMatchObject({ ok: true, data: { instances: [{ id: 'lab-1' }] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it('force bypasses a cached snapshot', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(labsResponse('lab-1'))
      .mockResolvedValueOnce(labsResponse('lab-2'));

    await getLabsSnapshot();
    const forced = await getLabsSnapshot({ force: true });

    expect(forced.data.instances?.[0]?.id).toBe('lab-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the last successful snapshot while the document is hidden', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T00:00:00.000Z'));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(labsResponse('lab-visible'))
      .mockResolvedValueOnce(labsResponse('lab-refreshed'));

    await expect(getLabsSnapshot()).resolves.toMatchObject({ data: { instances: [{ id: 'lab-visible' }] } });
    vi.setSystemTime(new Date('2026-09-10T00:00:02.000Z'));
    visibility.mockReturnValue('hidden');

    await expect(getLabsSnapshot()).resolves.toMatchObject({ data: { instances: [{ id: 'lab-visible' }] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue('visible');
    await expect(getLabsSnapshot()).resolves.toMatchObject({ data: { instances: [{ id: 'lab-refreshed' }] } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not issue a background snapshot request while offline without cache', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(getLabsSnapshot()).resolves.toMatchObject({
      ok: false,
      status: 0,
      data: { error: expect.stringContaining('offline') },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
