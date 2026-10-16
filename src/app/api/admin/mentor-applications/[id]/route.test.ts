import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The real requireAdmin + withPlatformAdmin guards run; only identity resolution is mocked.
const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  decide: vi.fn(),
  getDetail: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/clerk-user', () => ({ getClerkAuthenticatedUser: mocks.currentUser }));
vi.mock('@/lib/auth/e2e-auth', () => ({ isE2EAuthEnabled: () => false, getE2EAuthenticatedUser: vi.fn() }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({}) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit, getRequestMetadata: () => ({}) }));
vi.mock('@/lib/mentorship/admin', () => ({ decideMentorApplication: mocks.decide, getMentorApplicationForReview: mocks.getDetail }));
vi.mock('@/lib/mentorship/http', async () => {
  const { NextResponse } = await import('next/server');
  return {
    mentorshipErrorResponse: (error: { message: string; code: string; status: number }) =>
      NextResponse.json({ error: error.message, code: error.code }, { status: error.status ?? 503 }),
  };
});

import { GET, PATCH } from './route';

const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const admin = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin', clerkUserId: 'clerk-admin' };
const learner = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'user', clerkUserId: 'clerk-user' };
const context = (value = id) => ({ params: Promise.resolve({ id: value }) });
const patch = (body: unknown) =>
  new NextRequest(`http://localhost/api/admin/mentor-applications/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateCsrfToken.mockResolvedValue(true);
  mocks.checkRateLimit.mockResolvedValue(null);
});

describe('admin mentor application review route', () => {
  it('requires authentication', async () => {
    mocks.currentUser.mockResolvedValue(null);
    const response = await PATCH(patch({ action: 'start_review' }), context());
    expect(response.status).toBe(401);
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it('forbids non-admin users from reading or deciding applications', async () => {
    mocks.currentUser.mockResolvedValue(learner);
    expect((await GET(new NextRequest(`http://localhost/api/admin/mentor-applications/${id}`), context())).status).toBe(403);
    expect((await PATCH(patch({ action: 'approve', tier: 'senior_mentor', specializationIds: ['databases'] }), context())).status).toBe(403);
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.getDetail).not.toHaveBeenCalled();
  });

  it('requires a CSRF token for decisions', async () => {
    mocks.currentUser.mockResolvedValue(admin);
    mocks.validateCsrfToken.mockResolvedValue(false);
    const response = await PATCH(patch({ action: 'start_review' }), context());
    expect(response.status).toBe(403);
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it('validates the decision payload and the id', async () => {
    mocks.currentUser.mockResolvedValue(admin);
    expect((await PATCH(patch({ action: 'reject', note: 'short' }), context())).status).toBe(400);
    expect((await PATCH(patch({ action: 'approve', tier: 'xp_legend', specializationIds: ['databases'] }), context())).status).toBe(400);
    expect((await PATCH(patch({ action: 'start_review' }), context('not-a-uuid'))).status).toBe(400);
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it('passes the authenticated admin id (never a client-supplied one) and audits the decision', async () => {
    mocks.currentUser.mockResolvedValue(admin);
    mocks.decide.mockResolvedValue({ application: { id }, applicantId: learner.id, from: 'submitted', to: 'under_review' });
    const response = await PATCH(patch({ action: 'start_review' }), context());
    expect(response.status).toBe(200);
    expect(mocks.decide).toHaveBeenCalledWith({ adminId: admin.id, applicationId: id, decision: { action: 'start_review' } });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: admin.id, action: 'admin.mentor.application.start_review', resourceId: id }));
  });

  it('surfaces domain refusals such as self-review', async () => {
    mocks.currentUser.mockResolvedValue(admin);
    mocks.decide.mockRejectedValue({ message: 'Administrators cannot review their own mentor application.', code: 'SELF_REVIEW_FORBIDDEN', status: 403 });
    const response = await PATCH(patch({ action: 'start_review' }), context());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'SELF_REVIEW_FORBIDDEN' });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});
