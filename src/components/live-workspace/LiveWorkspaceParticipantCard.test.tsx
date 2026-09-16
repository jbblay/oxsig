import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LiveWorkspaceParticipantCard from './LiveWorkspaceParticipantCard';

const participant = {
  id: 'alex-id',
  displayName: 'Alex Morgan',
  email: 'alex@example.com',
  avatarUrl: 'https://images.example.test/alex.jpg',
  collaborationStatus: 'focus' as const,
  collaborationStatusMessage: 'Debugging the lab network',
  role: 'learner' as const,
};

describe('LiveWorkspaceParticipantCard', () => {
  it('shows avatar, live presence, availability, and expandable profile details', () => {
    render(
      <LiveWorkspaceParticipantCard
        participant={participant}
        online
        viewerId="viewer-id"
        canManage={false}
        managerIsOwner={false}
        busy={false}
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    const profile = screen.getByLabelText('Open Alex Morgan profile, online');
    expect(profile.querySelector('img')).toHaveAttribute('src', participant.avatarUrl);
    expect(screen.getByText('Focus')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();

    fireEvent.click(profile);
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(screen.getByText('“Debugging the lab network”')).toBeInTheDocument();
  });

  it('falls back to initials and exposes offline state', () => {
    render(
      <LiveWorkspaceParticipantCard
        participant={{ ...participant, avatarUrl: null, collaborationStatus: 'available', collaborationStatusMessage: null }}
        online={false}
        viewerId="alex-id"
        canManage={false}
        managerIsOwner={false}
        busy={false}
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Open Alex Morgan profile, offline')).toHaveTextContent('AM');
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });
});
