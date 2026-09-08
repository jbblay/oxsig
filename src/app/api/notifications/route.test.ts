import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), validateCsrfToken: vi.fn(), checkRateLimit: vi.fn(), getPool: vi.fn(), query: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));

import { GET, PATCH } from './route';

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const notificationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const pool = { query: mocks.query };

function request(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/notifications', {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('Durable notifications API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req: NextRequest, handler: any) => handler(req, { id: ownerId }));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getPool.mockReturnValue(pool);
  });

  it('returns notifications and an unread count for the authenticated owner', async () => {
    mocks.query.mockResolvedValue({ rows: [
      {
        id: notificationId,
        notification_type: 'live.control_request',
        title: 'Terminal control requested',
        detail: 'Learner requested control.',
        href: '/live',
        severity: 'warning',
        read_at: null,
        created_at: new Date('2026-09-08T12:00:00Z'),
      },
    ] });

    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.unreadCount).toBe(1);
    expect(body.notifications[0]).toMatchObject({ id: notificationId, type: 'live.control_request', href: '/live' });
    expect(mocks.query.mock.calls[0][1]).toEqual([ownerId]);
  });

  it('marks only the authenticated owner notification ids as read', async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    const response = await PATCH(request('PATCH', { ids: [notificationId] }));
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('id = ANY'), [ownerId, [notificationId]]);
  });

  it('rejects empty notification updates', async () => {
    const response = await PATCH(request('PATCH', {}));
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
