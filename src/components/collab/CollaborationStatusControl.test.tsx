import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCsrfToken: vi.fn(),
}));

vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: mocks.getCsrfToken }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CollaborationStatusControl from './CollaborationStatusControl';

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

describe('CollaborationStatusControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
  });

  it('loads the profile and persists a selected collaboration status', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/users/me') {
        return Promise.resolve(json({ user: { displayName: 'Jamie', email: 'jamie@example.com', bio: 'Builder', avatarUrl: '' } }));
      }
      if (url === '/api/users/me/collaboration-status' && !init?.method) {
        return Promise.resolve(json({ status: 'available', message: '' }));
      }
      if (url === '/api/users/me/collaboration-status' && init?.method === 'PATCH') {
        return Promise.resolve(json({ status: 'busy', message: '' }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CollaborationStatusControl />);
    const trigger = await screen.findByRole('button', { name: /your profile status: available/i });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: /busy/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/users/me/collaboration-status', expect.objectContaining({ method: 'PATCH' }));
    });
    expect(await screen.findByRole('button', { name: /your profile status: busy/i })).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
