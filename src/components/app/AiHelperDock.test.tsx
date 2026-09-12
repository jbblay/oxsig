import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCsrfToken: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/home' }));
vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    info: vi.fn(),
    success: vi.fn(),
  },
}));
vi.mock('@/lib/auth/use-auth', () => ({
  useAuth: () => ({
    sessionIdentityId: 'clerk-user-1',
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'user-1' },
  }),
}));
vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: mocks.getCsrfToken }));

import AiHelperDock from './AiHelperDock';

const successfulPlan = {
  title: 'Copy-on-write',
  explanation: 'Copy-on-write shares pages until one side writes to them.',
  objective: 'Explain COW',
  command: null,
  expected: 'No execution required',
  risk: 'read-only',
  approvalReason: 'No execution required.',
  nextConcept: 'Page faults',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function openHelper() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('oxsig:ai-helper:open'));
  });
  return screen.findByRole('textbox');
}

describe('AI Helper request recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
  });

  it('preserves a timed-out prompt and retries the same logical request without duplicating the user turn', async () => {
    const postBodies: Array<Record<string, unknown>> = [];
    let postCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'POST') return jsonResponse({ history: [], completedRequestIds: [] });
      postCount += 1;
      postBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      if (postCount === 1) {
        return jsonResponse({ error: 'AI request timed out. Your prompt is safe to retry.', code: 'AI_REQUEST_TIMEOUT' }, 504);
      }
      return jsonResponse({ plan: successfulPlan });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AiHelperDock />);
    const textbox = await openHelper();
    await waitFor(() => expect(textbox).not.toBeDisabled());

    fireEvent.change(textbox, { target: { value: 'Explain copy-on-write' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));

    expect(await screen.findByText('Request timed out')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Explain copy-on-write');
    expect(screen.getByRole('button', { name: /retry/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByText(successfulPlan.explanation)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Request timed out')).not.toBeInTheDocument());
    expect(postBodies).toHaveLength(2);
    expect(postBodies[0].requestId).toBe(postBodies[1].requestId);
    expect(screen.getAllByText('Explain copy-on-write')).toHaveLength(1);
  });

  it('allows only one active submission and aborts it when the component unmounts', async () => {
    let providerSignal: AbortSignal | undefined;
    let postCalls = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'POST') return Promise.resolve(jsonResponse({ history: [], completedRequestIds: [] }));
      postCalls += 1;
      providerSignal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        providerSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render(<AiHelperDock />);
    const textbox = await openHelper();
    await waitFor(() => expect(textbox).not.toBeDisabled());
    fireEvent.change(textbox, { target: { value: 'Keep this request controlled' } });

    const form = screen.getByRole('button', { name: 'Send question' }).closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    await screen.findByText('Generating…');
    expect(postCalls).toBe(1);
    expect(providerSignal?.aborted).toBe(false);

    view.unmount();
    expect(providerSignal?.aborted).toBe(true);
  });
});
