import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), validateCsrfToken: vi.fn(), checkRateLimit: vi.fn(), getPool: vi.fn(),
  poolQuery: vi.fn(), clientQuery: vi.fn(), release: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));

import { GET, POST } from './route';

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const client = { query: mocks.clientQuery, release: mocks.release };
const pool = { query: mocks.poolQuery, connect: vi.fn(async () => client) };

function request(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/workspace-state', {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('Durable workspace state API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, { id: ownerId }));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue(pool);
    mocks.clientQuery.mockResolvedValue({ rows: [] });
  });

  it('returns durable activity and recent workspaces for the authenticated owner', async () => {
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('workspace_activity_events')) {
        return { rows: [{
          client_event_id: 'event-1', label: 'Opened Cyber Lab', detail: 'Workspace ready', href: '/labs',
          color: 'labs', kind: 'navigation', occurred_at: new Date('2026-09-08T12:00:00Z'),
        }] };
      }
      return { rows: [{ href: '/labs', label: 'Cyber Lab', color: 'labs', last_visited_at: new Date('2026-09-08T12:00:00Z') }] };
    });

    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.activity[0]).toMatchObject({ id: 'event-1', href: '/labs', color: 'labs' });
    expect(body.recents[0]).toMatchObject({ href: '/labs', label: 'Cyber Lab' });
    expect(mocks.poolQuery).toHaveBeenCalledTimes(2);
  });

  it('syncs client events using authenticated ownership and deduplicating client ids', async () => {
    const response = await POST(request('POST', {
      activity: [{ id: 'event-1', label: 'Opened Vault', detail: 'Workspace ready', href: '/vault', color: 'vault', kind: 'navigation', at: Date.now() }],
      recents: [{ href: '/vault', label: 'Vault', color: 'vault', at: Date.now() }],
    }));

    expect(response.status).toBe(200);
    const activityInsert = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes('workspace_activity_events'));
    expect(activityInsert?.[1]?.[0]).toBe(ownerId);
    expect(activityInsert?.[1]?.[1]).toBe('event-1');
    expect(String(activityInsert?.[0])).toContain('ON CONFLICT (owner_id, client_event_id) DO NOTHING');
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('rejects external URLs before touching the database', async () => {
    const response = await POST(request('POST', {
      activity: [{ id: 'event-1', label: 'Bad redirect', href: 'https://example.com', color: 'home', kind: 'action', at: Date.now() }],
      recents: [],
    }));

    expect(response.status).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
