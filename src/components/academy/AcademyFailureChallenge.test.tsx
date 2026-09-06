import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCsrfToken: vi.fn() }));

vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: mocks.getCsrfToken }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import AcademyFailureChallenge from './AcademyFailureChallenge';

const labId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function attempt(state: 'injected' | 'remediated' | 'cleaned') {
  return {
    id: attemptId,
    state,
    workspacePath: `/tmp/oxsig-failure-labs/${attemptId}`,
    challenge: 'Diagnose the synthetic config mismatch.',
    constraints: ['Use only the isolated workspace.'],
    faultEvidence: { provenance: 'server-executed', check: 'fault', stdout: 'status=unhealthy\nobserved_mode=broken\n', stderr: '', exitCode: 23, observedAt: '2026-09-06T10:00:00Z' },
    verificationEvidence: state === 'remediated' ? { provenance: 'server-executed', check: 'verify', stdout: 'status=healthy\nobserved_mode=healthy\n', stderr: '', exitCode: 0, observedAt: '2026-09-06T10:02:00Z' } : null,
    cleanupEvidence: null,
    failureReason: null,
  };
}

describe('AcademyFailureChallenge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
  });

  it('does not call the mutation API when explicit browser confirmation is declined', () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmMock);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<AcademyFailureChallenge courseTitle="Linux" lessonTitle="Troubleshooting" labInstanceId={labId} />);
    fireEvent.click(screen.getByRole('button', { name: /inject troubleshooting fault/i }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('sends only the curated template with literal confirm true and exposes the isolated workspace', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      expect(body).toEqual({
        action: 'inject',
        courseTitle: 'Linux',
        lessonTitle: 'Troubleshooting',
        labInstanceId: labId,
        templateId: 'synthetic-config-mismatch-v1',
        confirm: true,
      });
      return new Response(JSON.stringify({ attempt: attempt('injected') }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AcademyFailureChallenge courseTitle="Linux" lessonTitle="Troubleshooting" labInstanceId={labId} />);
    fireEvent.click(screen.getByRole('button', { name: /inject troubleshooting fault/i }));

    await waitFor(() => expect(screen.getByText(new RegExp(attemptId))).toBeInTheDocument());
    expect(screen.getByText(/server-executed fault evidence/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
