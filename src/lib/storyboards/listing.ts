import type { StoryboardServerSession } from './types';

export const DEFAULT_STORYBOARD_PAGE_SIZE = 100;
export const MAX_STORYBOARD_PAGE_SIZE = 100;
export const MAX_STORYBOARD_SEARCH_LENGTH = 120;

export type StoryboardListScope = 'all' | 'mine' | 'shared';
export type StoryboardListStatus = StoryboardServerSession['status'];

export type StoryboardListCursor = {
  updatedAt: string;
  id: string;
};

export type StoryboardListOptions = {
  limit: number;
  cursor: StoryboardListCursor | null;
  query: string;
  scope: StoryboardListScope;
  status: StoryboardListStatus | null;
};

export type StoryboardListPage = {
  sessions: StoryboardServerSession[];
  nextCursor: string | null;
};

export type StoryboardListParseResult =
  | { ok: true; options: StoryboardListOptions }
  | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPES = new Set<StoryboardListScope>(['all', 'mine', 'shared']);
const STATUSES = new Set<StoryboardListStatus>(['draft', 'ready', 'archived']);

function normalizeLimit(value: string | null): number | null {
  if (!value) return DEFAULT_STORYBOARD_PAGE_SIZE;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, MAX_STORYBOARD_PAGE_SIZE);
}

export function encodeStoryboardListCursor(cursor: StoryboardListCursor): string {
  return `${encodeURIComponent(cursor.updatedAt)}~${cursor.id}`;
}

export function decodeStoryboardListCursor(value: string): StoryboardListCursor | null {
  const separator = value.lastIndexOf('~');
  if (separator <= 0 || separator === value.length - 1) return null;

  let updatedAt: string;
  try {
    updatedAt = decodeURIComponent(value.slice(0, separator));
  } catch {
    return null;
  }
  const id = value.slice(separator + 1);
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp) || !UUID_PATTERN.test(id)) return null;

  return { updatedAt: new Date(timestamp).toISOString(), id };
}

export function parseStoryboardListParams(params: URLSearchParams): StoryboardListParseResult {
  const limit = normalizeLimit(params.get('limit'));
  if (limit === null) return { ok: false, error: 'Invalid Board page limit' };

  const rawScope = params.get('scope') || 'all';
  if (!SCOPES.has(rawScope as StoryboardListScope)) {
    return { ok: false, error: 'Invalid Board scope filter' };
  }
  const scope = rawScope as StoryboardListScope;

  const rawStatus = params.get('status');
  if (rawStatus && !STATUSES.has(rawStatus as StoryboardListStatus)) {
    return { ok: false, error: 'Invalid Board status filter' };
  }

  const rawCursor = params.get('cursor');
  const cursor = rawCursor ? decodeStoryboardListCursor(rawCursor) : null;
  if (rawCursor && !cursor) return { ok: false, error: 'Invalid Board pagination cursor' };

  const query = (params.get('query') || '').trim().slice(0, MAX_STORYBOARD_SEARCH_LENGTH);

  return {
    ok: true,
    options: {
      limit,
      cursor,
      query,
      scope,
      status: rawStatus ? (rawStatus as StoryboardListStatus) : null,
    },
  };
}
