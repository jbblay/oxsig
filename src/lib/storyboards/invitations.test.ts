import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/pool', () => ({
  getPool: () => ({ query: mocks.query, connect: mocks.connect }),
}));
vi.mock('@/lib/email/server', () => ({
  escapeEmailHtml: (value: string) => value,
  publicAppUrl: (value: string) => value,
  sendTransactionalEmail: vi.fn(),
}));

import { acceptStoryboardInvitation } from './invitations';

describe('acceptStoryboardInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an account whose email does not match the invitation', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{
        id: '11111111-1111-4111-8111-111111111111',
        session_id: '22222222-2222-4222-8222-222222222222',
        email: 'invited@example.com',
        permission: 'viewer',
        status: 'pending',
        expires_at: '2099-01-01T00:00:00.000Z',
        accepted_by: null,
        deleted_at: null,
      }],
    });

    await expect(acceptStoryboardInvitation({
      token: 'test-token',
      userId: '33333333-3333-4333-8333-333333333333',
      userEmail: 'other@example.com',
    })).rejects.toMatchObject({ status: 403 });

    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('turns a valid invitation into a normal storyboard share', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{
        id: '11111111-1111-4111-8111-111111111111',
        session_id: '22222222-2222-4222-8222-222222222222',
        email: 'invited@example.com',
        permission: 'editor',
        status: 'pending',
        expires_at: '2099-01-01T00:00:00.000Z',
        accepted_by: null,
        deleted_at: null,
      }],
    });
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            session_id: '22222222-2222-4222-8222-222222222222',
            permission: 'editor',
            invited_by: '44444444-4444-4444-8444-444444444444',
          }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);

    const result = await acceptStoryboardInvitation({
      token: 'test-token',
      userId: '33333333-3333-4333-8333-333333333333',
      userEmail: 'invited@example.com',
    });

    expect(result).toEqual({
      sessionId: '22222222-2222-4222-8222-222222222222',
      alreadyAccepted: false,
    });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO storyboard_shares'),
      expect.arrayContaining(['33333333-3333-4333-8333-333333333333', 'editor'])
    );
    expect(client.release).toHaveBeenCalled();
  });
});
