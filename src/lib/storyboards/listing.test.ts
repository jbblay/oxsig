import { describe, expect, it } from 'vitest';
import {
  MAX_STORYBOARD_PAGE_SIZE,
  MAX_STORYBOARD_SEARCH_LENGTH,
  decodeStoryboardListCursor,
  encodeStoryboardListCursor,
  parseStoryboardListParams,
} from './listing';

describe('Board listing pagination contract', () => {
  it('round-trips a deterministic updated-at/id cursor', () => {
    const input = {
      updatedAt: '2026-09-17T12:34:56.789Z',
      id: '123e4567-e89b-42d3-a456-426614174000',
    };

    expect(decodeStoryboardListCursor(encodeStoryboardListCursor(input))).toEqual(input);
  });

  it('rejects malformed cursors rather than falling back to the first page', () => {
    expect(decodeStoryboardListCursor('not-a-cursor')).toBeNull();
    expect(decodeStoryboardListCursor('not-a-date~123e4567-e89b-42d3-a456-426614174000')).toBeNull();
    expect(decodeStoryboardListCursor('2026-09-17T12%3A34%3A56.789Z~not-a-uuid')).toBeNull();

    const parsed = parseStoryboardListParams(new URLSearchParams({ cursor: 'broken' }));
    expect(parsed).toEqual({ ok: false, error: 'Invalid Board pagination cursor' });
  });

  it('caps page size and validates scope/status filters', () => {
    const parsed = parseStoryboardListParams(new URLSearchParams({
      limit: '9999',
      scope: 'shared',
      status: 'ready',
    }));

    expect(parsed).toEqual({
      ok: true,
      options: {
        limit: MAX_STORYBOARD_PAGE_SIZE,
        cursor: null,
        query: '',
        scope: 'shared',
        status: 'ready',
      },
    });

    expect(parseStoryboardListParams(new URLSearchParams({ scope: 'everyone' }))).toEqual({
      ok: false,
      error: 'Invalid Board scope filter',
    });
    expect(parseStoryboardListParams(new URLSearchParams({ status: 'deleted' }))).toEqual({
      ok: false,
      error: 'Invalid Board status filter',
    });
  });

  it('normalizes search text without allowing unbounded request values', () => {
    const query = `  ${'x'.repeat(MAX_STORYBOARD_SEARCH_LENGTH + 20)}  `;
    const parsed = parseStoryboardListParams(new URLSearchParams({ query }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.options.query).toHaveLength(MAX_STORYBOARD_SEARCH_LENGTH);
  });

  it('rejects zero, negative, and non-numeric page limits', () => {
    for (const limit of ['0', '-1', 'abc', '2.5']) {
      expect(parseStoryboardListParams(new URLSearchParams({ limit }))).toEqual({
        ok: false,
        error: 'Invalid Board page limit',
      });
    }
  });
});
