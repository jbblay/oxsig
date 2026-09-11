import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: ReactNode }) => children,
  SignedOut: () => null,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignUpButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: vi.fn() }));

import StoryboardInviteAcceptance from './StoryboardInviteAcceptance';

describe('StoryboardInviteAcceptance', () => {
  it('shows the explicit Board acceptance action to a signed-in recipient', () => {
    render(<StoryboardInviteAcceptance token="invite-token" />);
    expect(screen.getByRole('button', { name: 'Accept Board invitation' })).toBeTruthy();
  });
});
