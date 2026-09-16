import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CollaborationTypingIndicator from './CollaborationTypingIndicator';

describe('CollaborationTypingIndicator', () => {
  it('shows and clears remote typing state from realtime events', () => {
    render(<CollaborationTypingIndicator />);

    act(() => {
      window.dispatchEvent(new CustomEvent('oxsig:collaboration:typing', {
        detail: { collaborationId: 'alpha', typingIds: ['user-2'] },
      }));
    });
    expect(screen.getByText('Someone is typing…')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('oxsig:collaboration:typing', {
        detail: { collaborationId: 'alpha', typingIds: ['user-2', 'user-3'] },
      }));
    });
    expect(screen.getByText('2 people are typing…')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('oxsig:collaboration:typing', {
        detail: { collaborationId: 'alpha', typingIds: [] },
      }));
    });
    expect(screen.queryByText(/typing/i)).not.toBeInTheDocument();
  });
});
