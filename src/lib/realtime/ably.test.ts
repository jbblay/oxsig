import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestToken: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('ably', () => ({
  Rest: class {
    auth = { requestToken: mocks.requestToken };
    channels = { get: vi.fn() };
  },
}));

import { issueStoryboardRealtimeToken } from './ably';

describe('Board realtime token authority', () => {
  beforeEach(() => {
    process.env.ABLY_API_KEY = 'test.key:secret';
    mocks.requestToken.mockReset();
    mocks.requestToken.mockResolvedValue({ token: 'token' });
  });

  it('keeps durable Board events subscribe-only while allowing ephemeral signals', async () => {
    await issueStoryboardRealtimeToken({ storyboardId: 'board-123', clientId: 'user-123' });

    expect(mocks.requestToken).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'user-123',
      capability: {
        'oxsig:board:board-123': ['subscribe'],
        'oxsig:board:board-123:signals': ['subscribe', 'publish', 'presence'],
      },
    }));
  });
});
