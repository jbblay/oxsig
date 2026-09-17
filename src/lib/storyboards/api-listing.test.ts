import { afterEach, describe, expect, it, vi } from 'vitest';
import { listServerStoryboards } from './api';
import type { StoryboardServerSession } from './types';

function session(id: string, updatedAt: string): StoryboardServerSession {
  return {
    id,
    title: `Board ${id}`,
    status: 'draft',
    durationMs: 0,
    hasAudio: false,
    ownerId: '123e4567-e89b-42d3-a456-426614174999',
    ownerName: 'Owner',
    permission: 'owner',
    version: 1,
    createdAt: updatedAt,
    updatedAt,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Board client listing', () => {
  it('follows every server cursor so Boards beyond the first 100 remain visible', async () => {
    const first = session('123e4567-e89b-42d3-a456-426614174001', '2026-09-17T12:03:00.000Z');
    const second = session('123e4567-e89b-42d3-a456-426614174002', '2026-09-17T12:02:00.000Z');
    const third = session('123e4567-e89b-42d3-a456-426614174003', '2026-09-17T12:01:00.000Z');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [first], nextCursor: 'cursor-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [second], nextCursor: 'cursor-2' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [third], nextCursor: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const sessions = await listServerStoryboards();

    expect(sessions.map((item) => item.id)).toEqual([first.id, second.id, third.id]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('limit=100');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('cursor=cursor-1');
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('cursor=cursor-2');
  });

  it('deduplicates a Board that moves between pages while preserving its newest representation', async () => {
    const older = session('123e4567-e89b-42d3-a456-426614174010', '2026-09-17T12:00:00.000Z');
    const newer = { ...older, title: 'Updated title', updatedAt: '2026-09-17T12:05:00.000Z', version: 2 };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [older], nextCursor: 'cursor-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [newer], nextCursor: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const sessions = await listServerStoryboards();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ title: 'Updated title', version: 2 });
  });

  it('fails closed on a repeated cursor instead of looping forever', async () => {
    const board = session('123e4567-e89b-42d3-a456-426614174020', '2026-09-17T12:00:00.000Z');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ sessions: [board], nextCursor: 'same-cursor' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listServerStoryboards()).rejects.toThrow(/repeated cursor/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
