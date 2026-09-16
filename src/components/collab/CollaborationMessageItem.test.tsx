import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CollaborationMessageItem, { type CollaborationMessageView } from './CollaborationMessageItem';

function message(overrides: Partial<CollaborationMessageView> = {}): CollaborationMessageView {
  return {
    id: 'm-1',
    collaborationId: 'alpha',
    text: 'Hello from Alex',
    type: 'text',
    metadata: {},
    createdAt: '2026-09-16T08:00:00.000Z',
    senderId: 'alex-id',
    senderName: 'Alex Morgan',
    senderEmail: 'alex@example.com',
    senderAvatar: null,
    isOwnMessage: false,
    reactions: [],
    ...overrides,
  };
}

const handlers = {
  onReply: vi.fn(),
  onEdit: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined),
  onReaction: vi.fn().mockResolvedValue(undefined),
  onRetry: vi.fn().mockResolvedValue(undefined),
};

describe('CollaborationMessageItem member identity', () => {
  it('shows the sender avatar and live online presence', () => {
    const view = render(
      <CollaborationMessageItem
        message={message({ senderAvatar: 'https://images.example.test/alex.jpg' })}
        activeId="alpha"
        onlineIds={['alex-id']}
        {...handlers}
      />
    );

    expect(screen.getByRole('button', { name: 'Open Alex Morgan profile, online' })).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://images.example.test/alex.jpg');
  });

  it('falls back to initials and exposes offline presence', () => {
    render(
      <CollaborationMessageItem
        message={message()}
        activeId="alpha"
        onlineIds={[]}
        {...handlers}
      />
    );

    expect(screen.getByRole('button', { name: 'Open Alex Morgan profile, offline' })).toHaveTextContent('AM');
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });
});