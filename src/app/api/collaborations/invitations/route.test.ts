import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: mocks.getPool }));

import { DELETE, GET } from './route';

const user = { id: '11111111-1111-4111-8111-111111111111', role: 'user' as const };
const invitationId = '22222222-2222-4222-8222-222222222222';

function request(method: 'GET' | 'DELETE') {
  return new NextRequest(`http://localhost/api/collaborations/invitations${method === 'DELETE' ? `?invitationId=${invitationId}` : ''}`, { method });
}

describe('/api/collaborations/invitations', () => {
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPool.mockReturnValue({ query });
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
  });

  it('lists only pending invitations for collaborations owned by the user', async () => {
    query.mockResolvedValue({ rows: [{
      id: invitationId,
      collaboration_id: '33333333-3333-4333-8333-333333333333',
      collaboration_name: 'Team session',
      email: 'learner@example.com',
      status: 'pending',
      delivery_status: 'sent',
      expires_at: new Date('2026-09-15T00:00:00.000Z'),
      created_at: new Date('2026-09-08T00:00:00.000Z'),
    }] });
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('collaboration.owner_id = $1'), [user.id]);
    expect((await response.json()).invitations).toHaveLength(1);
  });

  it('requires CSRF before revocation', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    const response = await DELETE(request('DELETE'));
    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('revokes only an owner-scoped pending invitation', async () => {
    query.mockResolvedValue({ rows: [{ id: invitationId }], rowCount: 1 });
    const response = await DELETE(request('DELETE'));
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("invitation.status = 'pending'"), [invitationId, user.id]);
    expect(await response.json()).toEqual({ revoked: true });
  });
});
