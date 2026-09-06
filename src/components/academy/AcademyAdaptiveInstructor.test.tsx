import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCsrfToken: vi.fn() }));

vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: mocks.getCsrfToken }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import AcademyAdaptiveInstructor from './AcademyAdaptiveInstructor';

function response(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
}

const status = {
  recommendedMode: 'guide',
  reason: 'Start with guided discovery.',
  guideHintCount: 0,
  nextHintLevel: 1,
  understandingScore: 42,
  understandingStatus: 'developing',
  latestReflectionScore: null,
  latestPracticeStatus: null,
  independence: {
    reflectedPractices: 1,
    requiredPractices: 2,
    instructorInterventions: 0,
    score: 50,
    status: 'supported',
  },
};

const intervention = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  recommendedMode: 'guide',
  requestedMode: 'guide',
  appliedMode: 'guide',
  kind: 'hint',
  hintLevel: 1,
  title: 'Start with the mechanism',
  guidance: 'Focus on what information the command asks the system to expose.',
  learnerPrompt: 'Which field should confirm the architecture?',
  example: null,
  independence: status.independence,
  createdAt: '2026-09-06T09:30:00.000Z',
};

describe('AcademyAdaptiveInstructor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
  });

  it('uses the server recommendation by default and requests the next progressive guide hint', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      bodies.push(body);
      if (body.action === 'status') return response({ status });
      if (body.action === 'coach') return response({ intervention });
      throw new Error('Unexpected request');
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AcademyAdaptiveInstructor
        courseTitle="Linux Basics"
        lessonTitle="Inspect the kernel"
        refreshKey="initial"
      />
    );

    await waitFor(() => expect(screen.getByText(/recommended · guide/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /get hint 1/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /get hint 1/i }));

    await waitFor(() => expect(screen.getByText('Start with the mechanism')).toBeInTheDocument());
    expect(bodies.some((body) => body.action === 'coach' && body.requestedMode === 'guide')).toBe(true);
    expect(screen.getByText(/support recorded/i)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
