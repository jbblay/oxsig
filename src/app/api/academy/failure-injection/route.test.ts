import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  inject: vi.fn(),
  verify: vi.fn(),
  cleanup: vi.fn(),
  captureProductEvent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/analytics/posthog', () => ({ captureProductEvent: mocks.captureProductEvent }));
vi.mock('@/lib/academy/failure-injection', () => ({
  FAILURE_TEMPLATE_ID: 'synthetic-config-mismatch-v1',
  AcademyFailureInjectionError: class AcademyFailureInjectionError extends Error {
    constructor(message: string, readonly code: string, readonly status = 409) {
      super(message);
    }
  },
  injectAcademyFailure: mocks.inject,
  verifyAcademyFailureRemediation: mocks.verify,
  cleanupAcademyFailure: mocks.cleanup,
}));

import { POST } from './route';

const user = { id: 'user-1', clerkUserId: 'clerk-1', role: 'user' as const };
const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const labId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/academy/failure-injection', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const attempt = {
  id: attemptId,
  lessonId: 'lesson-1',
  labInstanceId: labId,
  templateId: 'synthetic-config-mismatch-v1',
  state: 'injected',
  workspacePath: `/tmp/oxsig-failure-labs/${attemptId}`,
  challenge: 'Diagnose the synthetic config mismatch.',
  constraints: ['isolated'],
  preEvidence: null,
  faultEvidence: null,
  verificationEvidence: null,
  cleanupEvidence: null,
  failureReason: null,
  createdAt: '2026-09-06T10:00:00.000Z',
  injectedAt: '2026-09-06T10:01:00.000Z',
  remediatedAt: null,
  cleanedAt: null,
};

describe('Academy failure-injection API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.inject.mockResolvedValue(attempt);
    mocks.verify.mockResolvedValue({ ...attempt, state: 'remediated' });
    mocks.cleanup.mockResolvedValue({ ...attempt, state: 'cleaned' });
    mocks.captureProductEvent.mockResolvedValue(undefined);
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request({
      action: 'inject',
      courseTitle: 'Linux',
      lessonTitle: 'Troubleshooting',
      labInstanceId: labId,
      templateId: 'synthetic-config-mismatch-v1',
      confirm: true,
    }));

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
  });

  it('requires explicit true confirmation before any fault mutation', async () => {
    const response = await POST(request({
      action: 'inject',
      courseTitle: 'Linux',
      lessonTitle: 'Troubleshooting',
      labInstanceId: labId,
      templateId: 'synthetic-config-mismatch-v1',
      confirm: false,
    }));

    expect(response.status).toBe(400);
    expect(mocks.inject).not.toHaveBeenCalled();
  });

  it('accepts only the curated template id', async () => {
    const response = await POST(request({
      action: 'inject',
      courseTitle: 'Linux',
      lessonTitle: 'Troubleshooting',
      labInstanceId: labId,
      templateId: 'arbitrary-shell-command',
      confirm: true,
    }));

    expect(response.status).toBe(400);
    expect(mocks.inject).not.toHaveBeenCalled();
  });

  it('delegates injection with owner-bound course, lesson, and lab context', async () => {
    const response = await POST(request({
      action: 'inject',
      courseTitle: 'Linux',
      lessonTitle: 'Troubleshooting',
      labInstanceId: labId,
      templateId: 'synthetic-config-mismatch-v1',
      confirm: true,
    }));

    expect(response.status).toBe(200);
    expect(mocks.inject).toHaveBeenCalledWith({
      ownerId: user.id,
      courseTitle: 'Linux',
      lessonTitle: 'Troubleshooting',
      labInstanceId: labId,
    });
  });

  it('verifies and cleans by exact owned attempt id only', async () => {
    const verifyResponse = await POST(request({ action: 'verify', attemptId }));
    const cleanupResponse = await POST(request({ action: 'cleanup', attemptId }));

    expect(verifyResponse.status).toBe(200);
    expect(cleanupResponse.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith({ ownerId: user.id, attemptId });
    expect(mocks.cleanup).toHaveBeenCalledWith({ ownerId: user.id, attemptId });
  });
});
