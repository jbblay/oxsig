import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCsrfTokenCache, getCsrfToken } from './csrf-client';

describe('csrf-client', () => {
  beforeEach(() => {
    clearCsrfTokenCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses a cached token across sequential calls', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ token: 'token-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await expect(getCsrfToken()).resolves.toBe('token-1');
    await expect(getCsrfToken()).resolves.toBe('token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent token requests into one network call', async () => {
    let resolveResponse!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(pending);

    const first = getCsrfToken();
    const second = getCsrfToken();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(new Response(JSON.stringify({ token: 'token-2' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(first).resolves.toBe('token-2');
    await expect(second).resolves.toBe('token-2');
  });

  it('can be explicitly invalidated', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'token-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'token-2' }), { status: 200 }));

    await expect(getCsrfToken()).resolves.toBe('token-1');
    clearCsrfTokenCache();
    await expect(getCsrfToken()).resolves.toBe('token-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
