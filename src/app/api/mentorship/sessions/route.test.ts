import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Real requireAuth; only identity resolution is mocked.
const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  book: vi.fn(),
  list: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/clerk-user', () => ({ getClerkAuthenticatedUser: mocks.currentUser }));
vi.mock('@/lib/auth/e2e-auth', () => ({ isE2EAuthEnabled: () => false, getE2EAuthenticatedUser: vi.fn() }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit, getRequestMetadata: () => ({}) }));
vi.mock('@/lib/analytics/posthog', () => ({ captureProductEvent: vi.fn() }));
vi.mock('@/lib/mentorship/sessions', () => ({ bookMentorshipSession: mocks.book, listMentorshipSessions: mocks.list }));
vi.mock('@/lib/mentorship/http', async () => {
  const { NextResponse } = await import('next/server');
  return {
    NO_STORE: {},
    mentorshipErrorResponse: (error: { message: string; code: string; status: number }) =>
      NextResponse.json({ error: error.message, code: error.code }, { status: error.status ?? 503 }),
  };
});

import { GET, POST } from './route';

const user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'user', clerkUserId: 'clerk-user' };
const booking = {
  mentorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  offeringId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  specializationId: 'linux-systems',
  startsAt: '2026-10-19T09:00:00.000Z',
  learnerTimezone: 'UTC',
  topic: 'fork and exec',
  learnerGoal: 'Understand what execve replaces',
};
const post = (body: unknown) =>
  new NextRequest('http://localhost/api/mentorship/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue(user);
  mocks.validateCsrfToken.mockResolvedValue(true);
  mocks.checkRateLimit.mockResolvedValue(null);
});

describe('/api/mentorship/sessions', () => {
  it('requires authentication to list or book', async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect((await GET(new NextRequest('http://localhost/api/mentorship/sessions'))).status).toBe(401);
    expect((await POST(post(booking))).status).toBe(401);
    expect(mocks.book).not.toHaveBeenCalled();
  });

  it('requires CSRF and a fail-closed booking rate limit', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);
    expect((await POST(post(booking))).status).toBe(403);
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.book.mockResolvedValue({ id: 's1', kind: 'guided_coaching', durationMinutes: 30 });
    await POST(post(booking));
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failClosed: true }), user.id, 'mentorship-booking');
  });

  it('books for the authenticated learner and rejects spoofed learner or price fields', async () => {
    expect((await POST(post({ ...booking, learnerId: 'someone-else' }))).status).toBe(400);
    expect((await POST(post({ ...booking, priceCents: 500 }))).status).toBe(400);
    mocks.book.mockResolvedValue({ id: 's1', kind: 'guided_coaching', durationMinutes: 30 });
    expect((await POST(post(booking))).status).toBe(201);
    expect(mocks.book).toHaveBeenCalledWith(user.id, expect.objectContaining({ mentorId: booking.mentorId, shareAcademyContext: false }));
  });

  it('returns booking conflicts with their code', async () => {
    mocks.book.mockRejectedValue({ message: 'That time was just taken.', code: 'SLOT_TAKEN', status: 409 });
    const response = await POST(post(booking));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'SLOT_TAKEN' });
  });
});
