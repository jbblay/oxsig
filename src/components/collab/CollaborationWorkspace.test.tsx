import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCsrfToken: vi.fn(),
  realtimeCallbacks: null as null | { onMessageCreated: () => void },
}));

vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: mocks.getCsrfToken }));
vi.mock('@/lib/collab/use-realtime', () => ({
  useCollaborationRealtime: (_activeId: string | null, callbacks: { onMessageCreated: () => void }) => {
    mocks.realtimeCallbacks = callbacks;
    return { state: 'connected', onlineCount: 1 };
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CollaborationWorkspace from './CollaborationWorkspace';

const sessions = [
  {
    id: 'alpha', name: 'Alpha', description: 'Alpha session', ownerId: 'owner', ownerName: 'Owner',
    memberCount: 1, lastMessage: '', lastMessageType: null, lastMessageAt: null,
    createdAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-06T10:00:00.000Z', isOwner: true,
  },
  {
    id: 'beta', name: 'Beta', description: 'Beta session', ownerId: 'owner', ownerName: 'Owner',
    memberCount: 1, lastMessage: '', lastMessageType: null, lastMessageAt: null,
    createdAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-06T10:00:00.000Z', isOwner: true,
  },
];

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

function message(collaborationId: string, id: string, text: string) {
  return {
    id,
    collaborationId,
    text,
    type: 'text',
    metadata: {},
    createdAt: '2026-09-06T10:00:00.000Z',
    senderId: 'owner',
    senderName: 'Owner',
    senderEmail: null,
    senderAvatar: null,
    isOwnMessage: true,
  };
}

const memberBody = {
  members: [{ id: 'owner', displayName: 'Owner', email: 'owner@example.com', role: 'owner', isOwner: true }],
  canInvite: true,
};

describe('CollaborationWorkspace session isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.realtimeCallbacks = null;
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });

  it('ignores a stale conversation response after the user switches sessions', async () => {
    let resolveAlphaMessages!: (value: Response) => void;
    let resolveAlphaMembers!: (value: Response) => void;
    const alphaMessages = new Promise<Response>((resolve) => { resolveAlphaMessages = resolve; });
    const alphaMembers = new Promise<Response>((resolve) => { resolveAlphaMembers = resolve; });

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/collaborations') return Promise.resolve(json({ collaborations: sessions }));
      if (url.includes('/alpha/messages')) return alphaMessages;
      if (url.includes('/alpha/members')) return alphaMembers;
      if (url.includes('/beta/messages')) return Promise.resolve(json({ messages: [message('beta', 'm-beta', 'Beta message')] }));
      if (url.includes('/beta/members')) return Promise.resolve(json(memberBody));
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CollaborationWorkspace />);

    await waitFor(() => expect(screen.getByRole('button', { name: /sessions/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /sessions/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /beta/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /beta/i }));
    await waitFor(() => expect(screen.getByText('Beta message')).toBeInTheDocument());

    await act(async () => {
      resolveAlphaMessages(json({ messages: [message('alpha', 'm-alpha', 'Alpha message')] }));
      resolveAlphaMembers(json(memberBody));
      await Promise.resolve();
    });

    expect(screen.getByText('Beta message')).toBeInTheDocument();
    expect(screen.queryByText('Alpha message')).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('clears the composer draft when switching to another session', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/collaborations') return Promise.resolve(json({ collaborations: sessions }));
      if (url.includes('/alpha/messages')) return Promise.resolve(json({ messages: [message('alpha', 'm-alpha', 'Alpha message')] }));
      if (url.includes('/alpha/members')) return Promise.resolve(json(memberBody));
      if (url.includes('/beta/messages')) return Promise.resolve(json({ messages: [message('beta', 'm-beta', 'Beta message')] }));
      if (url.includes('/beta/members')) return Promise.resolve(json(memberBody));
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CollaborationWorkspace />);

    await waitFor(() => expect(screen.getByText('Alpha message')).toBeInTheDocument());
    const alphaComposer = screen.getByPlaceholderText(/message alpha/i);
    fireEvent.change(alphaComposer, { target: { value: 'Draft for Alpha' } });
    expect(alphaComposer).toHaveValue('Draft for Alpha');

    fireEvent.click(screen.getByRole('button', { name: /sessions/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /beta/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /beta/i }));

    await waitFor(() => expect(screen.getByPlaceholderText(/message beta/i)).toHaveValue(''));
    vi.unstubAllGlobals();
  });

  it('lets a current silent realtime refresh resolve an earlier visible loading state', async () => {
    let alphaMessageCalls = 0;
    let alphaMemberCalls = 0;
    const never = new Promise<Response>(() => undefined);

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/collaborations') return Promise.resolve(json({ collaborations: sessions }));
      if (url.includes('/alpha/messages')) {
        alphaMessageCalls += 1;
        return alphaMessageCalls === 1
          ? never
          : Promise.resolve(json({ messages: [message('alpha', 'm-fresh', 'Fresh realtime message')] }));
      }
      if (url.includes('/alpha/members')) {
        alphaMemberCalls += 1;
        return alphaMemberCalls === 1 ? never : Promise.resolve(json(memberBody));
      }
      if (url.includes('/beta/messages')) return Promise.resolve(json({ messages: [] }));
      if (url.includes('/beta/members')) return Promise.resolve(json(memberBody));
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CollaborationWorkspace />);

    await waitFor(() => expect(screen.getByText(/^loading…$/i)).toBeInTheDocument());
    expect(mocks.realtimeCallbacks).not.toBeNull();

    act(() => mocks.realtimeCallbacks?.onMessageCreated());

    await waitFor(() => expect(screen.getByText('Fresh realtime message')).toBeInTheDocument());
    expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
