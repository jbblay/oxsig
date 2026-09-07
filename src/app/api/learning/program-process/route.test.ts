import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  checkRateLimit: vi.fn(),
  validateCsrfToken: vi.fn(),
  query: vi.fn(),
  createAcademyCourse: vi.fn(),
  recordLearningActivity: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/middleware', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/security/csrf', () => ({ validateCsrfToken: mocks.validateCsrfToken }));
vi.mock('@/lib/db/pool', () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock('@/lib/academy/persistence', () => ({ createAcademyCourse: mocks.createAcademyCourse }));
vi.mock('@/lib/learning/activity', () => ({ recordLearningActivity: mocks.recordLearningActivity }));

import { GET, POST } from './route';
import { PROGRAM_PROCESS_SOURCE_PROMPT } from '@/lib/learning/program-process-path';

const user = { id: '11111111-1111-4111-8111-111111111111', clerkUserId: 'clerk-1', role: 'user' as const };
const enrollment = {
  id: '22222222-2222-4222-8222-222222222222',
  status: 'active',
  active_capability_id: 'command-resolution',
  enrolled_at: new Date('2026-09-07T08:00:00.000Z'),
  last_activity_at: new Date('2026-09-07T08:00:00.000Z'),
  completed_at: null,
};

function installAuth() {
  mocks.requireAuth.mockImplementation(async (
    req: NextRequest,
    handler: (req: NextRequest, currentUser: typeof user) => Promise<NextResponse>
  ) => handler(req, user));
  mocks.checkRateLimit.mockResolvedValue(null);
  mocks.validateCsrfToken.mockResolvedValue(true);
}

function getRequest() {
  return new NextRequest('http://localhost/api/learning/program-process');
}

function postRequest() {
  return new NextRequest('http://localhost/api/learning/program-process', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'start' }),
  });
}

describe('program process reference path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installAuth();
  });

  it('returns a genuine zero state when the learner has not enrolled', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.state.enrollment).toBeNull();
    expect(body.state.progressPercent).toBe(0);
    expect(body.state.demonstratedCount).toBe(0);
    expect(body.state.totalCapabilities).toBe(8);
    expect(body.state.capabilities.every((item: { status: string }) => item.status === 'not_started')).toBe(true);
  });

  it('requires both persisted practice and explain-back evidence for normal capability demonstration', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [enrollment] })
      .mockResolvedValueOnce({
        rows: [
          { capability_id: 'command-resolution', source_type: 'academy-practice', result: 'demonstrated', score: null },
          { capability_id: 'fork-copy-on-write', source_type: 'academy-practice', result: 'demonstrated', score: null },
          { capability_id: 'fork-copy-on-write', source_type: 'academy-reflection', result: 'demonstrated', score: 91 },
        ],
      });

    const response = await GET(getRequest());
    const body = await response.json();

    const command = body.state.capabilities.find((item: { id: string }) => item.id === 'command-resolution');
    const fork = body.state.capabilities.find((item: { id: string }) => item.id === 'fork-copy-on-write');
    expect(command.status).toBe('in_progress');
    expect(fork.status).toBe('demonstrated');
    expect(fork.evidence.bestReflectionScore).toBe(91);
    expect(body.state.demonstratedCount).toBe(1);
    expect(body.state.progressPercent).toBe(13);
  });

  it('allows a persisted assessment to demonstrate a capability without manufacturing lesson completion', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [enrollment] })
      .mockResolvedValueOnce({
        rows: [{ capability_id: 'command-resolution', source_type: 'assessment', result: 'demonstrated', score: 94 }],
      });

    const response = await GET(getRequest());
    const body = await response.json();

    expect(body.state.capabilities[0].status).toBe('demonstrated');
    expect(body.state.capabilities[0].evidence.assessmentDemonstrated).toBe(true);
  });

  it('starts the curated Academy journey with zero assumed capability evidence', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO learning_path_enrollments')) return { rows: [{ id: enrollment.id }] };
      if (sql.includes('SELECT source_prompt')) return { rows: [{ source_prompt: 'old generated course' }] };
      if (sql.includes('FROM learning_path_enrollments')) return { rows: [enrollment] };
      if (sql.includes('FROM learning_capability_evidence')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.createAcademyCourse).toHaveBeenCalledTimes(1);
    expect(mocks.createAcademyCourse.mock.calls[0][0]).toBe(user.id);
    expect(mocks.createAcademyCourse.mock.calls[0][1]).toBe(PROGRAM_PROCESS_SOURCE_PROMPT);
    expect(mocks.recordLearningActivity).toHaveBeenCalledWith(user.id, 'academy');
    expect(body.state.progressPercent).toBe(0);
    expect(body.state.capabilities[0].status).toBe('in_progress');
    expect(body.state.capabilities.slice(1).every((item: { status: string }) => item.status === 'not_started')).toBe(true);
  });

  it('rejects starting the path without CSRF validation', async () => {
    mocks.validateCsrfToken.mockResolvedValue(false);

    const response = await POST(postRequest());

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
