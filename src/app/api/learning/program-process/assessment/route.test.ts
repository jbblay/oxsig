import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateCsrfToken: vi.fn(),
  checkRateLimit: vi.fn(),
  query: vi.fn(),
  evaluateAssessment: vi.fn(),
  recordLearningActivity: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock('@/lib/learning/activity', () => ({ recordLearningActivity: mocks.recordLearningActivity }));
vi.mock('@/lib/learning/program-process-assessment', () => ({
  evaluateProgramProcessAssessment: mocks.evaluateAssessment,
}));

import { POST } from './route';

const user = { id: 'user-1', clerkUserId: 'clerk-1', role: 'user' as const };
const enrollmentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const practiceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/learning/program-process/assessment', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('program-to-process prove-what-you-know assessment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(async (
      req: NextRequest,
      handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
    ) => handler(req, user));
    mocks.validateCsrfToken.mockResolvedValue(true);
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.recordLearningActivity.mockResolvedValue(undefined);
  });

  it('requires a real passed practical checkpoint before assessment can bypass teaching', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: enrollmentId }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await POST(request({
      capabilityId: 'fork-copy-on-write',
      explanation: 'fork creates a child with a separate process identity and copy-on-write mappings rather than eagerly duplicating every physical page.',
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('PRACTICE_REQUIRED');
    expect(mocks.evaluateAssessment).not.toHaveBeenCalled();
  });

  it('persists demonstrated assessment evidence only after practical evidence and a passing explanation', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: enrollmentId }] })
      .mockResolvedValueOnce({ rows: [{
        id: practiceId,
        command: 'python3 fork-demo.py',
        stdout: 'parent=10 child=11',
        stderr: '',
        exit_code: 0,
        evaluation: { status: 'passed' },
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mocks.evaluateAssessment.mockResolvedValue({
      score: 92,
      status: 'demonstrated',
      feedback: 'You correctly separated process identity, virtual memory, and physical copy-on-write behavior.',
      evidenceConnection: 'The observed parent and child identities support the process-creation explanation.',
      misconceptions: [],
      nextStep: null,
    });

    const response = await POST(request({
      capabilityId: 'fork-copy-on-write',
      explanation: 'fork returns in both processes. The child gets its own PID and virtual address space, while physical pages can initially remain shared until a write triggers copy-on-write.',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assessment.result).toBe('demonstrated');
    expect(body.assessment.score).toBe(92);
    expect(mocks.evaluateAssessment).toHaveBeenCalledWith(expect.objectContaining({
      capabilityId: 'fork-copy-on-write',
      practice: expect.objectContaining({ command: 'python3 fork-demo.py', exitCode: 0 }),
    }));
    expect(mocks.query.mock.calls[2][0]).toContain('learning_capability_evidence');
    expect(mocks.query.mock.calls[2][1]).toContain('demonstrated');
    expect(mocks.recordLearningActivity).toHaveBeenCalledWith(user.id, 'academy');
  });
});
