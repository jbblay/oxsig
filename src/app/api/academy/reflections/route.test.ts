import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  createAcademyPrediction: vi.fn(),
  claimAcademyReflection: vi.fn(),
  completeAcademyReflection: vi.fn(),
  getAcademyUnderstandingForReflection: vi.fn(),
  releaseAcademyReflectionClaim: vi.fn(),
  evaluateAcademyReflection: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/academy/server', () => ({
  academyModel: () => 'test-model',
  evaluateAcademyReflection: mocks.evaluateAcademyReflection,
}));
vi.mock('@/lib/academy/reflections', () => ({
  AcademyReflectionError: class AcademyReflectionError extends Error {
    constructor(message: string, readonly code: string, readonly status = 409) {
      super(message);
    }
  },
  createAcademyPrediction: mocks.createAcademyPrediction,
  claimAcademyReflection: mocks.claimAcademyReflection,
  completeAcademyReflection: mocks.completeAcademyReflection,
  getAcademyUnderstandingForReflection: mocks.getAcademyUnderstandingForReflection,
  releaseAcademyReflectionClaim: mocks.releaseAcademyReflectionClaim,
}));

import { POST } from './route';

const user = { id: 'user-1', clerkUserId: 'clerk-1', role: 'user' as const };
const reflectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const evidenceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/academy/reflections', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const predicted = {
  id: reflectionId,
  lessonId: 'lesson-1',
  command: 'uname -a',
  prediction: 'I expect kernel and architecture details.',
  evidenceId: null,
  explanation: null,
  evaluation: null,
  explanationScore: null,
  status: 'predicted',
  createdAt: '2026-09-06T05:00:00.000Z',
  reflectedAt: null,
};

const claim = {
  reflection: {
    ...predicted,
    status: 'evaluating',
    evidenceId,
    explanation: 'The output identifies the running kernel and machine architecture.',
  },
  course: { title: 'Linux Basics' },
  lessonTitle: 'Inspect the kernel',
  instruction: 'Inspect kernel information.',
  expected: 'Kernel details.',
  evidence: {
    id: evidenceId,
    labInstanceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    command: 'uname -a',
    stdout: 'Linux lab 6.8.0 x86_64',
    stderr: '',
    exitCode: 0,
    practiceEvaluation: { status: 'passed', summary: 'Kernel details observed.' },
  },
};

const reflectionEvaluation = {
  score: 88,
  status: 'demonstrated',
  predictionComparison: 'The prediction matched the observation.',
  explanationFeedback: 'The explanation connects the fields to their meaning.',
  evidenceConnection: 'The kernel release and x86_64 fields support the explanation.',
  nextStep: null,
};

const understanding = {
  reflectedPractices: 1,
  requiredPractices: 2,
  averageReflectionScore: 88,
  score: 44,
  status: 'developing',
};

describe('Academy learning reflections API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.createAcademyPrediction.mockResolvedValue(predicted);
    mocks.claimAcademyReflection.mockResolvedValue({ claim });
    mocks.evaluateAcademyReflection.mockResolvedValue(reflectionEvaluation);
    mocks.completeAcademyReflection.mockResolvedValue({
      reflection: { ...claim.reflection, status: 'reflected', evaluation: reflectionEvaluation, explanationScore: 88 },
      understanding,
    });
    mocks.getAcademyUnderstandingForReflection.mockResolvedValue(understanding);
    mocks.releaseAcademyReflectionClaim.mockResolvedValue(undefined);
  });

  it('keeps authentication as the outer boundary', async () => {
    mocks.requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await POST(request({
      action: 'predict',
      courseTitle: 'Linux Basics',
      lessonTitle: 'Inspect the kernel',
      prediction: 'I expect kernel details.',
    }));

    expect(response.status).toBe(401);
    expect(mocks.validateCsrfToken).not.toHaveBeenCalled();
  });

  it('stores prediction intent before execution without accepting evidence', async () => {
    const response = await POST(request({
      action: 'predict',
      courseTitle: 'Linux Basics',
      lessonTitle: 'Inspect the kernel',
      prediction: 'I expect kernel details.',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.createAcademyPrediction).toHaveBeenCalledWith({
      ownerId: user.id,
      courseTitle: 'Linux Basics',
      lessonTitle: 'Inspect the kernel',
      prediction: 'I expect kernel details.',
    });
    expect(body.reflection.id).toBe(reflectionId);
  });

  it('rejects reflection payloads that try to resubmit terminal output', async () => {
    const response = await POST(request({
      action: 'reflect',
      reflectionId,
      evidenceId,
      explanation: 'I understand the evidence.',
      stdout: 'forged-output',
    }));

    expect(response.status).toBe(400);
    expect(mocks.claimAcademyReflection).not.toHaveBeenCalled();
    expect(mocks.evaluateAcademyReflection).not.toHaveBeenCalled();
  });

  it('evaluates only the server-claimed exact evidence context', async () => {
    const response = await POST(request({
      action: 'reflect',
      reflectionId,
      evidenceId,
      explanation: 'The output identifies the running kernel and machine architecture.',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.claimAcademyReflection).toHaveBeenCalledWith({
      ownerId: user.id,
      reflectionId,
      evidenceId,
      explanation: 'The output identifies the running kernel and machine architecture.',
    });
    expect(mocks.evaluateAcademyReflection).toHaveBeenCalledWith(expect.objectContaining({
      prediction: predicted.prediction,
      command: 'uname -a',
      stdout: 'Linux lab 6.8.0 x86_64',
      exitCode: 0,
      practiceEvaluation: claim.evidence.practiceEvaluation,
    }));
    expect(mocks.completeAcademyReflection).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: user.id,
      reflectionId,
      evidenceId,
      model: 'test-model',
      evaluation: reflectionEvaluation,
    }));
    expect(body.understanding.score).toBe(44);
  });

  it('reuses an already reflected record with durable understanding and no AI provider call', async () => {
    mocks.claimAcademyReflection.mockResolvedValue({
      existing: { ...predicted, evidenceId, status: 'reflected', evaluation: reflectionEvaluation, explanationScore: 88 },
    });

    const response = await POST(request({
      action: 'reflect',
      reflectionId,
      evidenceId,
      explanation: 'Retry after the response was lost.',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.replayed).toBe(true);
    expect(body.understanding).toEqual(understanding);
    expect(mocks.getAcademyUnderstandingForReflection).toHaveBeenCalledWith(user.id, reflectionId);
    expect(mocks.evaluateAcademyReflection).not.toHaveBeenCalled();
    expect(mocks.completeAcademyReflection).not.toHaveBeenCalled();
  });

  it('releases the evaluation claim when the AI provider fails', async () => {
    mocks.evaluateAcademyReflection.mockRejectedValue(new Error('provider unavailable'));

    const response = await POST(request({
      action: 'reflect',
      reflectionId,
      evidenceId,
      explanation: 'The kernel details explain the observed result.',
    }));

    expect(response.status).toBe(502);
    expect(mocks.releaseAcademyReflectionClaim).toHaveBeenCalledWith({
      ownerId: user.id,
      reflectionId,
      evidenceId,
    });
    expect(mocks.completeAcademyReflection).not.toHaveBeenCalled();
  });
});
