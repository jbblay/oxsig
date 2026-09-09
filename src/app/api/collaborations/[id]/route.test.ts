import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  deleteCollaborationObjects: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));
vi.mock('@/lib/collab/storage', () => ({ deleteCollaborationObjects: mocks.deleteCollaborationObjects }));

import { DELETE, GET, PATCH } from './route';

const user = { id: 'user-1', role: 'user' as const };
const collaborationId = '22222222-2222-4222-8222-222222222222';
const row = {
  id: collaborationId,
  name: 'Team session',
  description: 'Work together',
  owner_id: user.id,
  collaboration_type: 'chat',
  status: 'active',
  created_at: new Date('2026-09-08T00:00:00.000Z'),
  updated_at: new Date('2026-09-08T00:00:00.000Z'),
};

function input(method: 'GET' | 'PATCH' | 'DELETE', body?: unknown, id = collaborationId) {
  return {
    request: new NextRequest(`http://localhost/api/collaborations/${id}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
    context: { params: Promise.resolve({ id }) },
  };
}

describe('/api/collaborations/[id]', () => {
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, user: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.deleteCollaborationObjects.mockResolvedValue(0);
    mocks.getPool.mockReturnValue({ query });
    query.mockResolvedValue({ rows: [row], rowCount: 1 });
  });

  it('loads collaboration details for an authorized participant', async () => {
    const args = input('GET');
    const response = await GET(args.request, args.context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).collaboration.isOwner).toBe(true);
  });

  it('requires CSRF for owner edits', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    const args = input('PATCH', { name: 'Renamed' });
    const response = await PATCH(args.request, args.context);
    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('updates metadata only through owner-scoped SQL', async () => {
    const args = input('PATCH', { name: 'Renamed', description: null });
    const response = await PATCH(args.request, args.context);
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('owner_id = $2'), [
      collaborationId,
      user.id,
      'Renamed',
      true,
      null,
    ]);
  });

  it('does not reveal non-owned mutation targets', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    const args = input('PATCH', { name: 'Renamed' });
    const response = await PATCH(args.request, args.context);
    expect(response.status).toBe(404);
  });

  it('cleans attachment objects before deleting an owned collaboration', async () => {
    mocks.deleteCollaborationObjects.mockResolvedValue(3);
    const args = input('DELETE');
    const response = await DELETE(args.request, args.context);
    expect(response.status).toBe(200);
    expect(mocks.deleteCollaborationObjects).toHaveBeenCalledWith(collaborationId);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SELECT id'), [collaborationId, user.id]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM collaborations'), [collaborationId, user.id]);
    expect(await response.json()).toEqual({ deleted: true });
  });

  it('deletes an attachment-free collaboration when storage cleanup is unavailable', async () => {
    mocks.deleteCollaborationObjects.mockRejectedValue(new Error('storage unavailable'));
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("metadata ? 'attachment'")) return { rows: [{ has_attachments: false }], rowCount: 1 };
      if (sql.includes('DELETE FROM collaborations')) return { rows: [{ id: collaborationId }], rowCount: 1 };
      return { rows: [row], rowCount: 1 };
    });

    const args = input('DELETE');
    const response = await DELETE(args.request, args.context);
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("metadata ? 'attachment'"), [collaborationId]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM collaborations'), [collaborationId, user.id]);
    expect(await response.json()).toEqual({ deleted: true, attachmentCleanupDeferred: true });
  });

  it('does not delete relational data if referenced attachment cleanup fails', async () => {
    mocks.deleteCollaborationObjects.mockRejectedValue(new Error('storage unavailable'));
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("metadata ? 'attachment'")) return { rows: [{ has_attachments: true }], rowCount: 1 };
      return { rows: [row], rowCount: 1 };
    });

    const args = input('DELETE');
    const response = await DELETE(args.request, args.context);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Could not delete collaboration attachments. Nothing was deleted.' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SELECT id'), [collaborationId, user.id]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("metadata ? 'attachment'"), [collaborationId]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM collaborations'))).toBe(false);
  });
});
