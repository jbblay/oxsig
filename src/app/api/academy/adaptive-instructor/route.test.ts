import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  getStatus: vi.fn(),
  createIntervention: vi.fn(),
  captureProductEvent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/analytics/posthog', () => ({ captureProductEvent: mocks.captureProductEvent }));
vi.mock('@/lib/academy/adaptive-instructor', () => ({
  AcademyAdaptiveInstructorError: class AcademyAdaptiveInstructorError extends Error {
    constructor(message: string, readonly code: string, readonly status = 409) {
      super(message);
    }
  },
  getAcademyAdaptiveInstructorStatus: mocks.getStatus,
  createAcademyInstructorIntervention: mocks.createIntervention,
}));

import { POST } from './route';

const user = { id: 'user-1', clerkUserId: 'clerk-1', role: 'user' as const };

function request(body: unknown) {
  return new NextRequest('http://localhost/api/academy/adaptive-instructor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const status = {
  recommendedMode: 'guide',
  reason: 'Begin with guided discovery.',
  guideHintCount: 0,
  nextHintLevel: 1,
  understandingScore: 0,
  understandingStatus: 'not_started',
  latestReflectionScore: null,
  latestPracticeStatus: null,
  independence: {
    reflectedPractices: 0,
    requiredPractices: 2,
    instructorInterventions: 0,
    score: 0,
    status: 'not_started',
  },
};

const intervention = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  recommendedMode: 'guide',
  requestedMode: 'guide',
  appliedMode: 'guide',
  kind: 'hint',
  hintLevel: 1,
  title: 'Look at the mechanism',
  guidance: 'Focus on what the command asks the kernel to report.',
  learnerPrompt: 'Which part of the expected result should appear first?',
  example: null,
  independence: status.independence,
  createdAt: '2026-09-06T09:30:00.000Z',
};

describe('Academy adaptive instructor API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.getStatus.mockResolvedValue(status);
    mocks.createIntervention.mockResolvedValue(intervention);
    mocks.captureProductEvent.mockResolvedValue(undefined);
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request({
      action: 'status',
      courseTitle: 'Linux Basics',
      lessonTitle: 'Inspect the kernel',
    }));

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
  });

  it('loads adaptive status only from the owned server-side Academy state', async () => {
    const response = await POST(request({
      action: 'status',
      courseTitle: 'Linux Basics',
      lessonTitle: 'Inspect the kernel',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getStatus).toHaveBeenCalledWith({
      ownerId: user.id,
      courseTitle: 'Linux Basics',
      lessonTitle: 'Inspect the kernel',
    });
    expect(body.status.recommendedMode).toBe('guide');
  });

  it('rejects browser-supplied understanding or score fields', async () => {
    const response = await POST(request({
      action: 'status',
      courseTitle: 'Linux Basics',
      lessonTitle: 'Inspect the kernel',
      understandingScore: 100,
    }));

    expect(response.status).toBe(400);
    expect(mocks.getStatus).not.toHaveBeenCalled();
  });

  it('records the learner-selected autonomy mode without allowing arbitrary modes', async () => {
    const response = await POST(request({
      action: 'coach',
      courseTitle: 'Linux Basics',
      lessonTitle: 'Inspect the kernel',
      requestedMode: 'guide',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.createIntervention).toHaveBeenCalledWith({
      ownerId: user.id,
      courseTitle: 'Linux Basics',
      lessonTitle: 'Inspect the kernel',
      requestedMode: 'guide',
    });
    expect(body.intervention.hintLevel).toBe(1);
    expect(mocks.captureProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'academy_instructor_intervention',
      properties: expect.objectContaining({ applied_mode: 'guide', hint_level: 1 }),
    }));
  });

  it('rejects an unsupported autonomy mode before touching the instructor service', async () => {
    const response = await POST(request({
      action: 'coach',
      courseTitle: 'Linux Basics',
      lessonTitle: 'Inspect the kernel',
      requestedMode: 'solve-it-for-me',
    }));

    expect(response.status).toBe(400);
    expect(mocks.createIntervention).not.toHaveBeenCalled();
  });
});
