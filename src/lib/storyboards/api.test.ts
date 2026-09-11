import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCsrfToken: vi.fn() }));

vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: mocks.getCsrfToken }));

import { saveServerStoryboard } from './api';
import type { StoryboardDraft } from './types';

function draft(overrides: Partial<StoryboardDraft> = {}): StoryboardDraft {
  return {
    version: 1,
    id: 'local-1',
    title: 'Recovery board',
    createdAt: 1,
    updatedAt: 2,
    durationMs: 0,
    events: [{ id: 'clear-1', type: 'clear', t: 0 }],
    status: 'local-draft',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('saveServerStoryboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getCsrfToken.mockResolvedValue('csrf-test');
  });

  it('recreates an owner board when a recovery draft points at a deleted server session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Storyboard not found' }, 404))
      .mockResolvedValueOnce(jsonResponse({ session: { id: 'new-board', permission: 'owner' } }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveServerStoryboard(
      draft({ serverId: 'old-board', serverPermission: 'owner' }),
      'old-board'
    );

    expect(result.id).toBe('new-board');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/storyboards/old-board');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/storyboards');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
  });

  it('does not fork a revoked editor board into a new owner board', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Storyboard not found' }, 404)
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      saveServerStoryboard(
        draft({ serverId: 'shared-board', serverPermission: 'editor' }),
        'shared-board'
      )
    ).rejects.toThrow('Storyboard not found');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH');
  });

  it('fails closed when a stale linked draft has no explicit ownership permission', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Storyboard not found' }, 404)
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      saveServerStoryboard(draft({ serverId: 'unknown-board' }), 'unknown-board')
    ).rejects.toThrow('Storyboard not found');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH');
  });

  it('creates a new durable board directly for a local-only draft', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ session: { id: 'created-board', permission: 'owner' } }, 201)
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await saveServerStoryboard(draft());

    expect(result.id).toBe('created-board');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/storyboards');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
  });
});
