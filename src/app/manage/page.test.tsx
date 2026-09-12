import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCsrfToken: vi.fn(),
}));

vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: mocks.getCsrfToken }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ManageResourcesPage from './page';

const COLLABORATIONS = '/api/collaborations';
const WORKSPACES = '/api/live-workspaces?includeEnded=owned';
const INVITATIONS = '/api/collaborations/invitations';
const INFRASTRUCTURE = '/api/labs/infrastructure-design';

type ResponseFactory = () => Response;
type Endpoint = typeof COLLABORATIONS | typeof WORKSPACES | typeof INVITATIONS | typeof INFRASTRUCTURE;

const collaboration = (name = 'Owned collaboration', memberCount = 2) => ({
  id: '11111111-1111-4111-8111-111111111111',
  name,
  description: '',
  collaborationType: 'chat',
  memberCount,
  isOwner: true,
  updatedAt: '2026-09-12T00:00:00.000Z',
});

const workspace = (name = 'Owned workspace') => ({
  id: '22222222-2222-4222-8222-222222222222',
  name,
  description: '',
  isOwner: true,
  role: 'owner',
  status: 'active' as const,
  updatedAt: '2026-09-12T00:00:00.000Z',
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const defaults: Record<Endpoint, ResponseFactory> = {
  [COLLABORATIONS]: () => json({ collaborations: [collaboration()] }),
  [WORKSPACES]: () => json({ workspaces: [workspace()] }),
  [INVITATIONS]: () => json({ invitations: [] }),
  [INFRASTRUCTURE]: () => json({ design: null }),
};

function installFetch(queues: Partial<Record<Endpoint, ResponseFactory[]>> = {}) {
  const pending = new Map<Endpoint, ResponseFactory[]>(
    Object.entries(queues).map(([key, value]) => [key as Endpoint, [...(value || [])]])
  );

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input) as Endpoint;
    const queue = pending.get(url);
    const factory = queue?.shift() || defaults[url];
    if (!factory) throw new Error(`Unexpected fetch: ${url}`);
    return factory();
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function fetchCount(fetchMock: ReturnType<typeof vi.fn>, url: Endpoint) {
  return fetchMock.mock.calls.filter(([input]) => String(input) === url).length;
}

describe('Manage Resources panel recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [COLLABORATIONS, 'Collaboration sessions resources', 'No sessions', 'Collaboration sessions'],
    [WORKSPACES, 'Live Workspaces resources', 'No workspaces', 'Live Workspaces'],
    [INVITATIONS, 'Invitations resources', 'No invitations', 'Invitations'],
    [INFRASTRUCTURE, 'Infrastructure design resources', 'No saved design', null],
  ] as const)('isolates an initial %s failure to its own panel', async (endpoint, cardLabel, fakeEmptyText, countLabel) => {
    installFetch({
      [endpoint]: [() => json({ error: 'Endpoint unavailable' }, 503)],
    });

    render(<ManageResourcesPage />);

    const failedCard = screen.getByLabelText(cardLabel);
    const alert = await within(failedCard).findByRole('alert');
    expect(alert).toHaveTextContent('Current data unavailable');
    expect(alert).toHaveTextContent('Endpoint unavailable');
    expect(within(failedCard).queryByText(fakeEmptyText)).not.toBeInTheDocument();

    if (countLabel) {
      expect(within(failedCard).getByLabelText(`${countLabel} count unavailable`)).toHaveTextContent('—');
    }

    if (endpoint === COLLABORATIONS) {
      expect(await screen.findByText('Owned workspace')).toBeInTheDocument();
    } else {
      expect(await screen.findByText('Owned collaboration')).toBeInTheDocument();
    }
  });

  it('renders known empty as zero while a failed sibling remains unknown', async () => {
    installFetch({
      [WORKSPACES]: [() => json({ error: 'Workspace service unavailable' }, 503)],
    });

    render(<ManageResourcesPage />);

    const invitationCard = screen.getByLabelText('Invitations resources');
    expect(await within(invitationCard).findByText('No invitations')).toBeInTheDocument();
    expect(within(invitationCard).getByLabelText('Invitations count 0')).toHaveTextContent('0');

    const workspaceCard = screen.getByLabelText('Live Workspaces resources');
    expect(await within(workspaceCard).findByRole('alert')).toBeInTheDocument();
    expect(within(workspaceCard).queryByText('No workspaces')).not.toBeInTheDocument();
    expect(within(workspaceCard).getByLabelText('Live Workspaces count unavailable')).toHaveTextContent('—');
  });

  it('retries only the failed panel and clears its persistent error after recovery', async () => {
    const fetchMock = installFetch({
      [WORKSPACES]: [
        () => json({ error: 'Workspace service unavailable' }, 503),
        () => json({ workspaces: [workspace('Recovered workspace')] }),
      ],
    });

    render(<ManageResourcesPage />);

    const workspaceCard = screen.getByLabelText('Live Workspaces resources');
    expect(await within(workspaceCard).findByRole('alert')).toBeInTheDocument();

    fireEvent.click(within(workspaceCard).getByRole('button', { name: 'Retry Live Workspaces' }));

    expect(await within(workspaceCard).findByText('Recovered workspace')).toBeInTheDocument();
    await waitFor(() => expect(within(workspaceCard).queryByRole('alert')).not.toBeInTheDocument());
    expect(within(workspaceCard).getByLabelText('Live Workspaces count 1')).toHaveTextContent('1');

    expect(fetchCount(fetchMock, WORKSPACES)).toBe(2);
    expect(fetchCount(fetchMock, COLLABORATIONS)).toBe(1);
    expect(fetchCount(fetchMock, INVITATIONS)).toBe(1);
    expect(fetchCount(fetchMock, INFRASTRUCTURE)).toBe(1);
  });

  it('keeps last successful data stale when refresh fails while successful siblings still refresh', async () => {
    installFetch({
      [COLLABORATIONS]: [
        () => json({ collaborations: [collaboration('Collaboration v1', 2)] }),
        () => json({ error: 'Collaboration refresh unavailable' }, 503),
        () => json({ collaborations: [collaboration('Collaboration v2', 3)] }),
      ],
      [WORKSPACES]: [
        () => json({ workspaces: [workspace('Workspace v1')] }),
        () => json({ workspaces: [workspace('Workspace v2')] }),
      ],
    });

    render(<ManageResourcesPage />);

    const collaborationCard = screen.getByLabelText('Collaboration sessions resources');
    const workspaceCard = screen.getByLabelText('Live Workspaces resources');
    expect(await within(collaborationCard).findByText('Collaboration v1')).toBeInTheDocument();
    expect(await within(workspaceCard).findByText('Workspace v1')).toBeInTheDocument();

    const refreshButton = screen.getByRole('button', { name: /^refresh$/i });
    await waitFor(() => expect(refreshButton).toBeEnabled());
    fireEvent.click(refreshButton);

    expect(await within(collaborationCard).findByText('Showing last known data')).toBeInTheDocument();
    expect(within(collaborationCard).getByText('Collaboration v1')).toBeInTheDocument();
    expect(within(collaborationCard).getByText('2 members')).toBeInTheDocument();
    expect(within(collaborationCard).getByLabelText('Collaboration sessions count 1, stale')).toHaveTextContent('1 stale');
    expect(within(collaborationCard).queryByText('No sessions')).not.toBeInTheDocument();
    expect(await within(workspaceCard).findByText('Workspace v2')).toBeInTheDocument();

    fireEvent.click(within(collaborationCard).getByRole('button', { name: 'Retry Collaboration sessions' }));

    expect(await within(collaborationCard).findByText('Collaboration v2')).toBeInTheDocument();
    expect(within(collaborationCard).getByText('3 members')).toBeInTheDocument();
    await waitFor(() => expect(within(collaborationCard).queryByText('Showing last known data')).not.toBeInTheDocument());
    expect(within(collaborationCard).getByLabelText('Collaboration sessions count 1')).toHaveTextContent('1');
  });
});
