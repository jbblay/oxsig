import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getStoryboardAccess: vi.fn(),
  query: vi.fn(),
  createInvitation: vi.fn(),
  sendInvitation: vi.fn(),
  emailProviderConfigured: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/storyboards/server', () => ({ getStoryboardAccess: mocks.getStoryboardAccess }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock('@/lib/storyboards/invitations', () => ({
  createStoryboardInvitation: mocks.createInvitation,
  sendStoryboardInvitationEmail: mocks.sendInvitation,
}));
vi.mock('@/lib/email/resend', () => ({ emailProviderConfigured: mocks.emailProviderConfigured }));
vi.mock('@/lib/audit/logger', () => ({
  AUDIT_ACTIONS: { STORYBOARD_SHARE: 'storyboard.share' },
  getRequestMetadata: () => ({}),
  logAudit: mocks.logAudit,
}));

import { POST } from './route';

const sessionId = '11111111-1111-4111-8111-111111111111';

function request(body: unknown) {
  return new Request(`https://app.example.com/api/storyboards/${sessionId}/shares`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Storyboard share POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (req, handler) =>
      handler(req, { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'owner@example.com', name: 'Owner' })
    );
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getStoryboardAccess.mockResolvedValue({ permission: 'owner' });
    mocks.emailProviderConfigured.mockReturnValue(true);
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it('sends an invitation when the recipient does not have an account yet', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ title: 'Incident map', inviter_name: 'Owner' }] });
    mocks.createInvitation.mockResolvedValue({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      email: 'new@example.com',
      permission: 'viewer',
      token: 'token-value',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    mocks.sendInvitation.mockResolvedValue({ delivery: { sent: true } });

    const response = await POST(
      request({ email: 'new@example.com', permission: 'viewer' }) as never,
      { params: Promise.resolve({ id: sessionId }) }
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.share.displayName).toBe('Invitation pending');
    expect(mocks.createInvitation).toHaveBeenCalledWith(expect.objectContaining({
      sessionId,
      email: 'new@example.com',
      permission: 'viewer',
    }));
    expect(mocks.sendInvitation).toHaveBeenCalled();
  });

  it('fails clearly when external email delivery is not configured', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    mocks.emailProviderConfigured.mockReturnValue(false);

    const response = await POST(
      request({ email: 'new@example.com', permission: 'viewer' }) as never,
      { params: Promise.resolve({ id: sessionId }) }
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.configurationRequired).toEqual(['RESEND_API_KEY', 'EMAIL_FROM']);
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });
});
