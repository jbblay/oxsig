import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCsrfToken: vi.fn(),
  realtimeCallbacks: null as null | { onMessageCreated: () => void },
  authIdentityId: 'account-a' as string | null,
  scrollIntoView: vi.fn(),
}));

vi.mock('@/lib/auth/use-auth', () => ({
  useAuth: () => ({ sessionIdentityId: mocks.authIdentityId }),
}));
vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: mocks.getCsrfToken }));
vi.mock('@/lib/collab/use-realtime', () => ({
  useCollaborationRealtime: (_activeId: string | null, callbacks: { onMessageCreated: () => void }) => {
    mocks.realtimeCallbacks = callbacks;
    return { state: 'connected', onlineCount: 1, onlineIds: [] };
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

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
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

function standardFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/collaborations') return Promise.resolve(json({ collaborations: sessions }));
    if (url.includes('/alpha/messages') && init?.method === 'POST') {
      return Promise.resolve(json({ message: message('alpha', 'm-sent', JSON.parse(String(init.body)).text) }));
    }
    if (url.includes('/beta/messages') && init?.method === 'POST') {
      return Promise.resolve(json({ message: message('beta', 'm-beta-sent', JSON.parse(String(init.body)).text) }));
    }
    if (url.includes('/alpha/messages')) return Promise.resolve(json({ messages: [message('alpha', 'm-alpha', 'Alpha message')] }));
    if (url.includes('/alpha/members')) return Promise.resolve(json(memberBody));
    if (url.includes('/beta/messages')) return Promise.resolve(json({ messages: [message('beta', 'm-beta', 'Beta message')] }));
    if (url.includes('/beta/members')) return Promise.resolve(json(memberBody));
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

async function openSessions() {
  fireEvent.click(screen.getByRole('button', { name: /sessions/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /beta/i })).toBeInTheDocument());
}

async function chooseSession(name: 'alpha' | 'beta') {
  await openSessions();
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name, 'i') }));
  await waitFor(() => expect(screen.getByPlaceholderText(new RegExp(`message ${name}`, 'i'))).toBeInTheDocument());
}

describe('CollaborationWorkspace session isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.realtimeCallbacks = null;
    mocks.authIdentityId = 'account-a';
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: mocks.scrollIntoView });
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
    await chooseSession('beta');
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

  it('restores a separate unsent draft for each collaboration session', async () => {
    vi.stubGlobal('fetch', standardFetch());
    render(<CollaborationWorkspace />);

    await waitFor(() => expect(screen.getByText('Alpha message')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/message alpha/i), { target: { value: 'Draft for Alpha' } });

    await chooseSession('beta');
    const betaComposer = screen.getByPlaceholderText(/message beta/i);
    expect(betaComposer).toHaveValue('');
    fireEvent.change(betaComposer, { target: { value: 'Different draft for Beta' } });

    await chooseSession('alpha');
    expect(screen.getByPlaceholderText(/message alpha/i)).toHaveValue('Draft for Alpha');

    await chooseSession('beta');
    expect(screen.getByPlaceholderText(/message beta/i)).toHaveValue('Different draft for Beta');
    vi.unstubAllGlobals();
  });

  it('clears only the successfully sent session draft', async () => {
    vi.stubGlobal('fetch', standardFetch());
    render(<CollaborationWorkspace />);

    await waitFor(() => expect(screen.getByText('Alpha message')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/message alpha/i), { target: { value: 'Send Alpha' } });
    await chooseSession('beta');
    fireEvent.change(screen.getByPlaceholderText(/message beta/i), { target: { value: 'Keep Beta' } });
    await chooseSession('alpha');

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(screen.getByPlaceholderText(/message alpha/i)).toHaveValue(''));

    await chooseSession('beta');
    expect(screen.getByPlaceholderText(/message beta/i)).toHaveValue('Keep Beta');
    vi.unstubAllGlobals();
  });

  it('preserves the draft when sending fails', async () => {
    const fetchMock = standardFetch();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/alpha/messages') && init?.method === 'POST') return Promise.resolve(json({ error: 'send failed' }, 500));
      if (url === '/api/collaborations') return Promise.resolve(json({ collaborations: sessions }));
      if (url.includes('/alpha/messages')) return Promise.resolve(json({ messages: [message('alpha', 'm-alpha', 'Alpha message')] }));
      if (url.includes('/alpha/members')) return Promise.resolve(json(memberBody));
      if (url.includes('/beta/messages')) return Promise.resolve(json({ messages: [] }));
      if (url.includes('/beta/members')) return Promise.resolve(json(memberBody));
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CollaborationWorkspace />);
    await waitFor(() => expect(screen.getByText('Alpha message')).toBeInTheDocument());
    const composer = screen.getByPlaceholderText(/message alpha/i);
    fireEvent.change(composer, { target: { value: 'Retry this exact text' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /^send$/i })).not.toBeDisabled());
    expect(composer).toHaveValue('Retry this exact text');
    vi.unstubAllGlobals();
  });

  it('keeps persisted drafts isolated by authenticated account identity', async () => {
    vi.stubGlobal('fetch', standardFetch());
    const view = render(<CollaborationWorkspace />);

    await waitFor(() => expect(screen.getByText('Alpha message')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/message alpha/i), { target: { value: 'Account A private draft' } });

    mocks.authIdentityId = 'account-b';
    view.rerender(<CollaborationWorkspace />);
    await waitFor(() => expect(screen.getByPlaceholderText(/message alpha/i)).toHaveValue(''));
    fireEvent.change(screen.getByPlaceholderText(/message alpha/i), { target: { value: 'Account B draft' } });

    mocks.authIdentityId = 'account-a';
    view.rerender(<CollaborationWorkspace />);
    await waitFor(() => expect(screen.getByPlaceholderText(/message alpha/i)).toHaveValue('Account A private draft'));
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

  it('does not yank the viewport when a new message arrives while reading older messages', async () => {
    let alphaMessageCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/collaborations') return Promise.resolve(json({ collaborations: sessions }));
      if (url.includes('/alpha/messages')) {
        alphaMessageCalls += 1;
        const messages = alphaMessageCalls === 1
          ? [message('alpha', 'm-1', 'First message')]
          : [message('alpha', 'm-1', 'First message'), message('alpha', 'm-2', 'Incoming message')];
        return Promise.resolve(json({ messages }));
      }
      if (url.includes('/alpha/members')) return Promise.resolve(json(memberBody));
      if (url.includes('/beta/messages')) return Promise.resolve(json({ messages: [] }));
      if (url.includes('/beta/members')) return Promise.resolve(json(memberBody));
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CollaborationWorkspace />);
    await waitFor(() => expect(screen.getByText('First message')).toBeInTheDocument());
    await waitFor(() => expect(mocks.scrollIntoView).toHaveBeenCalled());

    const viewport = screen.getByRole('region', { name: /conversation messages/i });
    Object.defineProperties(viewport, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, value: 200, writable: true },
    });
    fireEvent.scroll(viewport);
    const scrollCallsBeforeIncoming = mocks.scrollIntoView.mock.calls.length;

    act(() => mocks.realtimeCallbacks?.onMessageCreated());
    await waitFor(() => expect(screen.getByText('Incoming message')).toBeInTheDocument());

    expect(mocks.scrollIntoView).toHaveBeenCalledTimes(scrollCallsBeforeIncoming);
    const newMessagesButton = screen.getByRole('button', { name: /new messages/i });
    fireEvent.click(newMessagesButton);
    expect(mocks.scrollIntoView).toHaveBeenCalledTimes(scrollCallsBeforeIncoming + 1);
    expect(screen.queryByRole('button', { name: /new messages/i })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('keeps following new messages when already near the bottom', async () => {
    let alphaMessageCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/collaborations') return Promise.resolve(json({ collaborations: sessions }));
      if (url.includes('/alpha/messages')) {
        alphaMessageCalls += 1;
        const messages = alphaMessageCalls === 1
          ? [message('alpha', 'm-1', 'First message')]
          : [message('alpha', 'm-1', 'First message'), message('alpha', 'm-2', 'Incoming message')];
        return Promise.resolve(json({ messages }));
      }
      if (url.includes('/alpha/members')) return Promise.resolve(json(memberBody));
      if (url.includes('/beta/messages')) return Promise.resolve(json({ messages: [] }));
      if (url.includes('/beta/members')) return Promise.resolve(json(memberBody));
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CollaborationWorkspace />);
    await waitFor(() => expect(screen.getByText('First message')).toBeInTheDocument());
    await waitFor(() => expect(mocks.scrollIntoView).toHaveBeenCalled());

    const viewport = screen.getByRole('region', { name: /conversation messages/i });
    Object.defineProperties(viewport, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, value: 650, writable: true },
    });
    fireEvent.scroll(viewport);
    const scrollCallsBeforeIncoming = mocks.scrollIntoView.mock.calls.length;

    act(() => mocks.realtimeCallbacks?.onMessageCreated());
    await waitFor(() => expect(screen.getByText('Incoming message')).toBeInTheDocument());

    expect(mocks.scrollIntoView).toHaveBeenCalledTimes(scrollCallsBeforeIncoming + 1);
    expect(screen.queryByRole('button', { name: /new messages/i })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
