import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ csrf: vi.fn(), access: vi.fn(), query: vi.fn(), transaction: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: (r: unknown, cb: any) => cb(r, { id: 'user' }) }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: m.csrf }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: () => null }));
vi.mock('@/lib/storyboards/server', () => ({ getStoryboardAccess: m.access }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: m.query, connect: async () => ({ query: m.transaction, release: m.release }) }) }));
import { POST } from './route';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const recipient = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const call = (body: unknown) => POST(new NextRequest(`http://localhost/api/storyboards/${id}/stream`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
describe('Board stream authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks(); m.csrf.mockResolvedValue(true); m.access.mockResolvedValue({ permission: 'owner' });
    m.query.mockResolvedValue({ rows: [] });
    vi.stubEnv('BOARD_TURN_URLS', 'turn:relay.example:3478'); vi.stubEnv('BOARD_TURN_SECRET', 'server-secret');
    m.transaction.mockImplementation(async (sql: string) => ({ rows: sql.includes('count(*)') ? [{ count: 0 }] : sql.includes('INSERT') ? [{ id: session }] : [] }));
  });
  it('rejects CSRF before reading Board access', async () => {
    m.csrf.mockResolvedValue(false);
    expect((await call({ action: 'join', presenter: true })).status).toBe(403);
    expect(m.access).not.toHaveBeenCalled();
  });
  it('rejects revoked Board access before signaling', async () => {
    m.access.mockResolvedValue(null);
    expect((await call({ action: 'poll', session, after: '0' })).status).toBe(404);
    expect(m.query).not.toHaveBeenCalled();
  });
  it('does not let a viewer impersonate the presenter', async () => {
    m.access.mockResolvedValue({ permission: 'viewer' });
    expect((await call({ action: 'join', presenter: true })).status).toBe(403);
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it('issues expiring relay credentials without exposing the shared secret', async () => {
    const response = await call({ action: 'join', presenter: true });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.iceServers[0].username).toMatch(/^\d+:/);
    expect(JSON.stringify(body)).not.toContain('server-secret');
    expect(m.release).toHaveBeenCalled();
  });
  it('enforces the viewer limit inside the board lock', async () => {
    m.transaction.mockImplementation(async (sql: string) => ({ rows: sql.includes('count(*)') ? [{ count: 8 }] : [] }));
    expect((await call({ action: 'join', presenter: false })).status).toBe(409);
    expect(m.transaction).toHaveBeenCalledWith('ROLLBACK');
  });
  it('rejects another user session', async () => {
    expect((await call({ action: 'poll', session, after: '0' })).status).toBe(410);
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('user_id=$3'), [session, id, 'user']);
  });
  it('rejects an offer from a viewer', async () => {
    m.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ presenter: false }] }).mockResolvedValueOnce({ rows: [{ presenter: true }] });
    expect((await call({ action: 'signal', session, recipient, kind: 'offer', payload: { type: 'offer', sdp: 'test' } })).status).toBe(403);
    expect(m.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO storyboard_stream_signals'))).toBe(false);
  });
  it('refuses to advertise a stream without relay configuration', async () => {
    vi.stubEnv('BOARD_TURN_SECRET', '');
    expect((await call({ action: 'join', presenter: true })).status).toBe(503);
    expect(m.transaction).not.toHaveBeenCalled();
  });
});
