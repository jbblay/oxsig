import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  getCsrfToken: vi.fn(),
}));

vi.mock('@/lib/auth/use-auth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    profileError: null,
    refresh: mocks.refresh,
  }),
}));
vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: mocks.getCsrfToken }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AccountPage from './page';

const profile = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Oxsig User',
  email: 'user@example.com',
  bio: 'Initial bio',
  role: 'user',
};

describe('AccountPage usability states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
  });

  it('shows a retryable profile error instead of an empty loading form', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));

    render(<AccountPage />);

    await waitFor(() => expect(screen.getByText(/profile unavailable/i)).toBeInTheDocument());
    expect(screen.getByText(/profile service returned 503/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it('marks profile edits dirty and can discard them back to the loaded profile', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ user: profile }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));

    render(<AccountPage />);

    const displayName = await screen.findByLabelText(/display name/i);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();

    fireEvent.change(displayName, { target: { value: 'Edited User' } });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Oxsig User');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();

    vi.unstubAllGlobals();
  });
});
