import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  answerAdaptiveQuestion: vi.fn(),
  evaluateAcademyPractice: vi.fn(),
  recordAcademyQuestion: vi.fn(),
  recordAcademyPractice: vi.fn(),
  getTerminalEvidenceForAnalysis: vi.fn(),
  storeExecutionEvidenceAnalysis: vi.fn(),
  captureProductEvent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/analytics/posthog', () => ({ captureProductEvent: mocks.captureProductEvent }));
vi.mock('@/lib/academy/adaptive-question', () => ({
  answerAdaptiveAcademyQuestion: mocks.answerAdaptiveQuestion,
}));
vi.mock('@/lib/academy/server', () => ({
  academyRequestSchema: {
    safeParse: (value: unknown) => ({ success: true, data: value }),
  },
  generateAcademyCourse: vi.fn(),
  evaluateAcademyPractice: mocks.evaluateAcademyPractice,
}));
vi.mock('@/lib/academy/persistence', () => ({
  createAcademyCourse: vi.fn(),
  recordAcademyQuestion: mocks.recordAcademyQuestion,
  recordAcademyPractice: mocks.recordAcademyPractice,
}));
vi.mock('@/lib/execution-evidence/server', () => ({
  getTerminalEvidenceForAnalysis: mocks.getTerminalEvidenceForAnalysis,
  storeExecutionEvidenceAnalysis: mocks.storeExecutionEvidenceAnalysis,
  ExecutionEvidenceConflictError: class ExecutionEvidenceConflictError extends Error {
    constructor(message: string, readonly code: string) {
      super(message);
    }
  },
}));

import { POST } from './route';

const user = { id: 'user-1', clerkUserId: 'clerk-1', role: 'user' as const };
const evidenceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const executionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const labId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/academy', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    id: evidenceId,
    ownerId: user.id,
    labInstanceId: labId,
    executionId,
    source: 'interactive-terminal',
    surface: 'academy',
    provenance: 'browser-observed',
    state: 'evidence_recorded',
    command: 'docker ps',
    stdout: 'ledger-container-output',
    stderr: 'ledger-warning',
    exitCode: 4,
    payload: {},
    createdAt: '2026-09-06T01:00:00.000Z',
    updatedAt: '2026-09-06T01:00:00.000Z',
    ...overrides,
  };
}

const evaluation = {
  status: 'needs-attention',
  summary: 'The stored checkpoint evidence shows a nonzero exit.',
  feedback: 'Review the ledger-backed stderr before retrying.',
  nextStep: 'Inspect Docker service status.',
};

function evaluationRequest(overrides: Record<string, unknown> = {}) {
  return {
    action: 'evaluate',
    evidenceId,
    labInstanceId: labId,
    courseTitle: 'Docker Basics',
    lessonTitle: 'List containers',
    instruction: 'List the running containers.',
    command: 'docker ps',
    expected: 'A container table or an empty list.',
    stdout: 'forged-client-success',
    stderr: '',
    exitCode: 0,
    ...overrides,
  };
}

describe('Academy request evidence and adaptive instruction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.answerAdaptiveQuestion.mockResolvedValue({
      answer: 'The daemon coordinates Docker engine operations.',
      suggestedAction: 'Relate the daemon to the client/server model.',
    });
    mocks.getTerminalEvidenceForAnalysis.mockResolvedValue(evidence());
    mocks.evaluateAcademyPractice.mockResolvedValue(evaluation);
    mocks.storeExecutionEvidenceAnalysis.mockResolvedValue(evidence({
      state: 'analyzed',
      analysisKind: 'academy',
      analysis: evaluation,
      model: 'test-model',
    }));
    mocks.recordAcademyQuestion.mockResolvedValue(undefined);
    mocks.recordAcademyPractice.mockResolvedValue(undefined);
    mocks.captureProductEvent.mockResolvedValue(undefined);
  });

  it('routes learner questions through the server-derived adaptive instructor policy', async () => {
    const response = await POST(request({
      action: 'ask',
      question: 'What does the Docker daemon do?',
      courseTitle: 'Docker Basics',
      lessonTitle: 'Client and daemon',
      lessonContext: 'browser-supplied context that must not determine the adaptive policy',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.answerAdaptiveQuestion).toHaveBeenCalledWith({
      ownerId: user.id,
      question: 'What does the Docker daemon do?',
      courseTitle: 'Docker Basics',
      lessonTitle: 'Client and daemon',
    });
    expect(mocks.answerAdaptiveQuestion).not.toHaveBeenCalledWith(expect.objectContaining({
      lessonContext: expect.anything(),
    }));
    expect(mocks.recordAcademyQuestion).toHaveBeenCalled();
    expect(body.answer.answer).toContain('daemon');
  });

  it('requires exact lab and evidence identifiers before loading terminal evidence', async () => {
    const response = await POST(request(evaluationRequest({ evidenceId: undefined })));

    expect(response.status).toBe(400);
    expect(mocks.getTerminalEvidenceForAnalysis).not.toHaveBeenCalled();
  });

  it('ignores resubmitted browser output and evaluates the exact Academy evidence record', async () => {
    const response = await POST(request(evaluationRequest()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getTerminalEvidenceForAnalysis).toHaveBeenCalledWith({
      ownerId: user.id,
      labInstanceId: labId,
      command: 'docker ps',
      surface: 'academy',
      evidenceId,
    });
    expect(mocks.evaluateAcademyPractice).toHaveBeenCalledWith(expect.objectContaining({
      command: 'docker ps',
      stdout: 'ledger-container-output',
      stderr: 'ledger-warning',
      exitCode: 4,
    }));
    expect(mocks.evaluateAcademyPractice).not.toHaveBeenCalledWith(expect.objectContaining({
      stdout: 'forged-client-success',
    }));
    expect(mocks.recordAcademyPractice).toHaveBeenCalledWith(expect.objectContaining({
      stdout: 'ledger-container-output',
      stderr: 'ledger-warning',
      exitCode: 4,
    }));
    expect(body.evidence).toMatchObject({
      id: evidenceId,
      executionId,
      provenance: 'browser-observed',
      state: 'analyzed',
    });
  });

  it('reuses an already analyzed Academy evidence record without another provider call', async () => {
    mocks.getTerminalEvidenceForAnalysis.mockResolvedValue(evidence({
      state: 'analyzed',
      analysisKind: 'academy',
      analysis: evaluation,
      model: 'stored-model',
    }));

    const response = await POST(request(evaluationRequest({ stdout: 'ignored' })));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evaluation).toEqual(evaluation);
    expect(mocks.evaluateAcademyPractice).not.toHaveBeenCalled();
    expect(mocks.storeExecutionEvidenceAnalysis).not.toHaveBeenCalled();
  });
});
