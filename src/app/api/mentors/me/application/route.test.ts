import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The real requireAuth guard runs; only identity resolution is mocked.
const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  submit: vi.fn(),
  resubmit: vi.fn(),
  withdraw: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/clerk-user', () => ({ getClerkAuthenticatedUser: mocks.currentUser }));
vi.mock('@/lib/auth/e2e-auth', () => ({ isE2EAuthEnabled: () => false, getE2EAuthenticatedUser: vi.fn() }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit, getRequestMetadata: () => ({}) }));
vi.mock('@/lib/analytics/posthog', () => ({ captureProductEvent: vi.fn() }));
vi.mock('@/lib/mentorship/server', () => ({
  submitMentorApplication: mocks.submit,
  resubmitMentorApplication: mocks.resubmit,
  withdrawMentorApplication: mocks.withdraw,
}));
vi.mock('@/lib/mentorship/http', async () => {
  const { NextResponse } = await import('next/server');
  return {
    NO_STORE: {},
    mentorshipErrorResponse: (error: { message: string; code: string; status: number }) =>
      NextResponse.json({ error: error.message, code: error.code }, { status: error.status ?? 503 }),
  };
});

import { POST } from './route';

const user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'user', clerkUserId: 'clerk-user' };
const application = {
  track: 'external',
  headline: 'Network engineer and coach',
  bio: 'b'.repeat(90),
  specializations: ['networking-dns'],
  yearsExperience: 8,
  motivation: 'm'.repeat(45),
  timezone: 'Europe/London',
  acceptCodeOfConduct: true,
};
const post = (body: unknown) =>
  new NextRequest('http://localhost/api/mentors/me/application', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue(user);
  mocks.validateCsrfToken.mockResolvedValue(true);
  mocks.checkRateLimit.mockResolvedValue(null);
});

describe('POST /api/mentors/me/application', () => {
  it('requires authentication', async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect((await POST(post({ action: 'submit', application }))).status).toBe(401);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('requires a CSRF token', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    expect((await POST(post({ action: 'submit', application }))).status).toBe(403);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('uses a fail-closed, per-user application rate limit', async () => {
    await POST(post({ action: 'submit', application }));
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failClosed: true }), user.id, 'mentor-application');
  });

  it('rejects attempts to self-assign a tier or skip the code of conduct', async () => {
    expect((await POST(post({ action: 'submit', application: { ...application, tier: 'senior_mentor' } }))).status).toBe(400);
    expect((await POST(post({ action: 'submit', application: { ...application, acceptCodeOfConduct: false } }))).status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('submits for the authenticated user only and audits it', async () => {
    mocks.submit.mockResolvedValue({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', track: 'external', specializations: ['networking-dns'] });
    const response = await POST(post({ action: 'submit', application }));
    expect(response.status).toBe(201);
    expect(mocks.submit).toHaveBeenCalledWith(user.id, expect.objectContaining({ track: 'external', specializations: ['networking-dns'] }));
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id, action: 'mentor.application.submit' }));
  });

  it('withdraws by id scoped to the authenticated user', async () => {
    const applicationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    mocks.withdraw.mockResolvedValue({ id: applicationId });
    expect((await POST(post({ action: 'withdraw', applicationId }))).status).toBe(200);
    expect(mocks.withdraw).toHaveBeenCalledWith(user.id, applicationId);
  });

  it('returns domain refusals with their status and code', async () => {
    mocks.submit.mockRejectedValue({ message: 'Not eligible', code: 'NOT_ELIGIBLE', status: 403 });
    const response = await POST(post({ action: 'submit', application: { ...application, track: 'academy', specializations: ['linux-systems'] } }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'NOT_ELIGIBLE' });
  });
});
