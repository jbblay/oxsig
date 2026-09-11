import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/storyboards/StoryboardInviteAcceptance', () => ({
  default: ({ token }: { token: string }) => <div data-token={token}>invite</div>,
}));

import StoryboardInvitePage from './page';

describe('StoryboardInvitePage', () => {
  it('passes the invitation token to the acceptance surface', async () => {
    const element = await StoryboardInvitePage({
      params: Promise.resolve({ token: 'invite-token' }),
    });

    expect(element.props.token).toBe('invite-token');
  });
});
