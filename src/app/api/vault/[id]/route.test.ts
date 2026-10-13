import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({
  requireAuth: (request: unknown, handler: Function) => handler(request, { id: 'owner' }),
}));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: async () => true }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: async () => null }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));

import { PATCH } from './route';

const ITEM_ID = '11111111-1111-4111-8111-111111111111';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    owner_id: 'owner',
    kind: 'command',
    title: 'Original title',
    summary: 'Original summary',
    body: 'echo original',
    language: 'bash',
    tags: ['linux'],
    pinned: false,
    archived: false,
    source_type: 'manual',
    source_id: null,
    metadata: {},
    version: '3',
    created_at: '2026-09-06T10:00:00.000Z',
    updated_at: '2026-09-06T10:00:00.000Z',
    ...overrides,
  };
}

function patch(body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/vault/${ITEM_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ITEM_ID }) }
  );
}

beforeEach(() => mocks.query.mockReset());

describe('PATCH /api/vault/[id]', () => {
  it('returns 404 without updating when the item is not owned by the caller', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const response = await patch({ version: 3, title: 'Takeover' });

    expect(response.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0][1]).toEqual([ITEM_ID, 'owner']);
  });

  it('returns 409 with the current server copy when the expected version is stale', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [row({ version: '4', title: 'Newer title' })] });

    const response = await patch({ version: 3, title: 'Stale edit' });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('VAULT_VERSION_CONFLICT');
    expect(body.current).toMatchObject({ id: ITEM_ID, title: 'Newer title', version: 4 });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('returns 409 with the current copy when a concurrent write wins the race', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [row()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row({ version: '4', title: 'Concurrent title' })] });

    const response = await patch({ version: 3, title: 'Losing edit' });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.current).toMatchObject({ title: 'Concurrent title', version: 4 });
  });

  it('merges a partial update with the stored row and guards on version and owner', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [row()] })
      .mockResolvedValueOnce({ rows: [row({ pinned: true, version: '4' })] });

    const response = await patch({ version: 3, pinned: true });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.item).toMatchObject({ pinned: true, version: 4, title: 'Original title' });
    const [sql, params] = mocks.query.mock.calls[1];
    expect(sql).toMatch(/WHERE id = \$1 AND owner_id = \$2 AND version = \$3/);
    expect(sql).toMatch(/version = version \+ 1/);
    expect(params.slice(0, 3)).toEqual([ITEM_ID, 'owner', 3]);
    expect(params[4]).toBe('Original title');
    expect(params[6]).toBe('echo original');
    expect(params[9]).toBe(true);
  });

  it('rejects text that only exceeds the column limit after NUL sanitization with 400, not 500', async () => {
    const title = `${'a'.repeat(159)}\u0000`;

    const response = await patch({ version: 3, title });

    expect(response.status).toBe(400);
    expect((await response.json()).details.fieldErrors.title).toBeDefined();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
