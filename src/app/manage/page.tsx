'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Boxes,
  Loader2,
  MailX,
  Network,
  Pencil,
  RadioTower,
  RefreshCcw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  beginResourcePanelLoad,
  createResourcePanelState,
  knownResourceCount,
  resolveResourcePanelFailure,
  resolveResourcePanelSuccess,
  type ResourcePanelState,
} from '@/lib/resources/panel-state';
import { getCsrfToken } from '@/lib/security/csrf-client';

type CollaborationItem = {
  id: string;
  name: string;
  description: string;
  collaborationType: string;
  memberCount: number;
  isOwner: boolean;
  updatedAt: string;
};

type WorkspaceItem = {
  id: string;
  name: string;
  description: string;
  isOwner: boolean;
  role: string;
  status: 'active' | 'ended';
  updatedAt: string;
};

type PendingInvitation = {
  id: string;
  collaborationId: string;
  collaborationName: string;
  email: string;
  deliveryStatus: string;
  expiresAt: string;
};

type PanelKey = 'collaborations' | 'workspaces' | 'invitations' | 'infrastructure';

type PanelFeedbackProps<T> = {
  label: string;
  state: ResourcePanelState<T>;
  isEmpty: (data: T) => boolean;
  emptyMessage?: string;
  staleEmptyMessage?: string;
  onRetry: () => void;
};

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || fallback;
}

async function fetchPanelJson<T>(url: string, fallback: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(await responseError(response, fallback));
  return response.json() as Promise<T>;
}

function PanelFeedback<T>({
  label,
  state,
  isEmpty,
  emptyMessage,
  staleEmptyMessage,
  onRetry,
}: PanelFeedbackProps<T>) {
  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading {label}…
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Current data unavailable</p>
          <p className="text-xs text-muted-foreground">{state.error}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry} disabled={state.refreshing} aria-label={`Retry ${label}`}>
          <RefreshCcw className={`h-4 w-4 ${state.refreshing ? 'animate-spin' : ''}`} /> Retry
        </Button>
      </div>
    );
  }

  const stale = state.status === 'stale';
  const staleAndEmpty = stale && state.data !== null && isEmpty(state.data);

  return (
    <>
      {stale && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <Badge variant="outline">Stale</Badge>
            <div className="min-w-0">
              <p className="text-sm font-medium">Showing last known data</p>
              <p className="text-xs text-muted-foreground">{state.error}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={onRetry} disabled={state.refreshing} aria-label={`Retry ${label}`}>
            <RefreshCcw className={`h-4 w-4 ${state.refreshing ? 'animate-spin' : ''}`} /> Retry
          </Button>
        </div>
      )}
      {state.status === 'empty' && emptyMessage && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{emptyMessage}</p>
      )}
      {staleAndEmpty && staleEmptyMessage && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{staleEmptyMessage}</p>
      )}
    </>
  );
}

function PanelCount<T>({ label, state }: { label: string; state: ResourcePanelState<T[]> }) {
  const count = knownResourceCount(state);
  const display = count === null
    ? state.status === 'loading' ? '…' : '—'
    : state.status === 'stale' ? `${count} stale` : String(count);
  const ariaLabel = count === null
    ? `${label} count ${state.status === 'loading' ? 'loading' : 'unavailable'}`
    : `${label} count ${count}${state.status === 'stale' ? ', stale' : ''}`;

  return <Badge variant="outline" aria-label={ariaLabel}>{display}</Badge>;
}

export default function ManageResourcesPage() {
  const [collaborations, setCollaborations] = React.useState<ResourcePanelState<CollaborationItem[]>>(
    () => createResourcePanelState<CollaborationItem[]>()
  );
  const [workspaces, setWorkspaces] = React.useState<ResourcePanelState<WorkspaceItem[]>>(
    () => createResourcePanelState<WorkspaceItem[]>()
  );
  const [invitations, setInvitations] = React.useState<ResourcePanelState<PendingInvitation[]>>(
    () => createResourcePanelState<PendingInvitation[]>()
  );
  const [infrastructure, setInfrastructure] = React.useState<ResourcePanelState<boolean>>(
    () => createResourcePanelState<boolean>()
  );
  const [busy, setBusy] = React.useState<string | null>(null);
  const inFlight = React.useRef(new Set<PanelKey>());

  const runPanelLoad = React.useCallback(async <T,>(
    key: PanelKey,
    setPanel: React.Dispatch<React.SetStateAction<ResourcePanelState<T>>>,
    request: () => Promise<T>,
    isEmpty: (data: T) => boolean
  ) => {
    if (inFlight.current.has(key)) return;

    inFlight.current.add(key);
    setPanel((current) => beginResourcePanelLoad(current));
    try {
      const data = await request();
      setPanel(resolveResourcePanelSuccess(data, isEmpty(data)));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Resource data could not be loaded';
      setPanel((current) => resolveResourcePanelFailure(current, message));
    } finally {
      inFlight.current.delete(key);
    }
  }, []);

  const loadCollaborations = React.useCallback(() => runPanelLoad(
    'collaborations',
    setCollaborations,
    async () => {
      const payload = await fetchPanelJson<{ collaborations: CollaborationItem[] }>(
        '/api/collaborations',
        'Could not load collaborations'
      );
      return (payload.collaborations || []).filter(
        (item) => item.isOwner && item.collaborationType !== 'live-workspace'
      );
    },
    (items) => items.length === 0
  ), [runPanelLoad]);

  const loadWorkspaces = React.useCallback(() => runPanelLoad(
    'workspaces',
    setWorkspaces,
    async () => {
      const payload = await fetchPanelJson<{ workspaces: WorkspaceItem[] }>(
        '/api/live-workspaces?includeEnded=owned',
        'Could not load Live Workspaces'
      );
      return (payload.workspaces || []).filter((item) => item.isOwner);
    },
    (items) => items.length === 0
  ), [runPanelLoad]);

  const loadInvitations = React.useCallback(() => runPanelLoad(
    'invitations',
    setInvitations,
    async () => {
      const payload = await fetchPanelJson<{ invitations: PendingInvitation[] }>(
        '/api/collaborations/invitations',
        'Could not load invitations'
      );
      return payload.invitations || [];
    },
    (items) => items.length === 0
  ), [runPanelLoad]);

  const loadInfrastructure = React.useCallback(() => runPanelLoad(
    'infrastructure',
    setInfrastructure,
    async () => {
      const payload = await fetchPanelJson<{ design: unknown | null }>(
        '/api/labs/infrastructure-design',
        'Could not load infrastructure design'
      );
      return Boolean(payload.design);
    },
    (hasDesign) => !hasDesign
  ), [runPanelLoad]);

  const loadAll = React.useCallback(async () => {
    await Promise.all([
      loadCollaborations(),
      loadWorkspaces(),
      loadInvitations(),
      loadInfrastructure(),
    ]);
  }, [loadCollaborations, loadInfrastructure, loadInvitations, loadWorkspaces]);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function mutate(
    key: string,
    url: string,
    method: 'PATCH' | 'DELETE',
    refresh: () => Promise<void>,
    body?: unknown
  ) {
    setBusy(key);
    try {
      const token = await getCsrfToken();
      const response = await fetch(url, {
        method,
        headers: {
          'x-csrf-token': token,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw new Error(await responseError(response, 'The resource could not be changed'));
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The resource could not be changed');
    } finally {
      setBusy(null);
    }
  }

  async function renameCollaboration(item: CollaborationItem) {
    const name = window.prompt('Collaboration name', item.name)?.trim();
    if (!name || name === item.name) return;
    await mutate(`collaboration:${item.id}`, `/api/collaborations/${item.id}`, 'PATCH', loadCollaborations, { name });
  }

  async function deleteCollaboration(item: CollaborationItem) {
    if (!window.confirm(`Permanently delete “${item.name}” and its collaboration history?`)) return;
    await mutate(`collaboration:${item.id}`, `/api/collaborations/${item.id}`, 'DELETE', loadCollaborations);
  }

  async function revokeInvitation(invitation: PendingInvitation) {
    if (!window.confirm(`Revoke the invitation for ${invitation.email} to “${invitation.collaborationName}”?`)) return;
    await mutate(
      `invitation:${invitation.id}`,
      `/api/collaborations/invitations?invitationId=${encodeURIComponent(invitation.id)}`,
      'DELETE',
      loadInvitations
    );
  }

  async function endWorkspace(item: WorkspaceItem) {
    if (!window.confirm(`End “${item.name}”? Active control requests and leases will be cancelled or revoked.`)) return;
    await mutate(`workspace:${item.id}`, `/api/live-workspaces/${item.id}`, 'PATCH', loadWorkspaces, { action: 'end' });
  }

  async function deleteWorkspace(item: WorkspaceItem) {
    if (!window.confirm(`Permanently delete Live Workspace “${item.name}”? Attached resources themselves will not be deleted.`)) return;
    await mutate(`workspace:${item.id}`, `/api/live-workspaces/${item.id}`, 'DELETE', loadWorkspaces);
  }

  async function deleteInfrastructureDesign() {
    if (!window.confirm('Permanently reset your saved infrastructure design?')) return;
    await mutate('infrastructure-design', '/api/labs/infrastructure-design', 'DELETE', loadInfrastructure);
  }

  const refreshing = [collaborations, workspaces, invitations, infrastructure]
    .some((panel) => panel.refreshing || panel.status === 'loading');

  return (
    <div className="mx-auto max-w-6xl space-y-4 py-1">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => void loadAll()} disabled={refreshing || Boolean(busy)}>
          <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Resource shortcuts">
        <Link href="/collab" className="group">
          <Card className="h-full transition hover:border-primary/30 hover:shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted group-hover:bg-primary/10 group-hover:text-primary"><Boxes className="h-5 w-5" /></span>
              <div><p className="font-semibold">Collaboration</p><p className="text-xs text-muted-foreground">Open sessions</p></div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/live" className="group">
          <Card className="h-full transition hover:border-primary/30 hover:shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted group-hover:bg-primary/10 group-hover:text-primary"><RadioTower className="h-5 w-5" /></span>
              <div><p className="font-semibold">Live Workspace</p><p className="text-xs text-muted-foreground">Open workspaces</p></div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/labs" className="group sm:col-span-2 lg:col-span-1">
          <Card className="h-full transition hover:border-primary/30 hover:shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted group-hover:bg-primary/10 group-hover:text-primary"><Network className="h-5 w-5" /></span>
              <div><p className="font-semibold">Infrastructure</p><p className="text-xs text-muted-foreground">Open Cyber Lab</p></div>
            </CardContent>
          </Card>
        </Link>
      </section>

      <Card aria-label="Collaboration sessions resources">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span>Collaboration sessions</span>
            <PanelCount label="Collaboration sessions" state={collaborations} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <PanelFeedback
            label="Collaboration sessions"
            state={collaborations}
            isEmpty={(items) => items.length === 0}
            emptyMessage="No sessions"
            staleEmptyMessage="Last successful check found no sessions."
            onRetry={() => void loadCollaborations()}
          />
          {collaborations.data?.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="truncate font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.memberCount} member{item.memberCount === 1 ? '' : 's'}</p></div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy === `collaboration:${item.id}`} onClick={() => void renameCollaboration(item)}><Pencil className="h-4 w-4" /> Rename</Button>
                <Button size="sm" variant="destructive" disabled={busy === `collaboration:${item.id}`} onClick={() => void deleteCollaboration(item)}><Trash2 className="h-4 w-4" /> Delete</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card aria-label="Live Workspaces resources">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span>Live Workspaces</span>
            <PanelCount label="Live Workspaces" state={workspaces} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <PanelFeedback
            label="Live Workspaces"
            state={workspaces}
            isEmpty={(items) => items.length === 0}
            emptyMessage="No workspaces"
            staleEmptyMessage="Last successful check found no workspaces."
            onRetry={() => void loadWorkspaces()}
          />
          {workspaces.data?.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{item.name}</p><Badge variant={item.status === 'active' ? 'default' : 'outline'} className="capitalize">{item.status}</Badge></div>
                {item.description && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {item.status === 'active' && <Button size="sm" variant="outline" disabled={busy === `workspace:${item.id}`} onClick={() => void endWorkspace(item)}>End</Button>}
                <Button size="sm" variant="destructive" disabled={busy === `workspace:${item.id}`} onClick={() => void deleteWorkspace(item)}><Trash2 className="h-4 w-4" /> Delete</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card aria-label="Invitations resources">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2"><MailX className="h-4 w-4" /> Invitations</span>
            <PanelCount label="Invitations" state={invitations} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <PanelFeedback
            label="Invitations"
            state={invitations}
            isEmpty={(items) => items.length === 0}
            emptyMessage="No invitations"
            staleEmptyMessage="Last successful check found no invitations."
            onRetry={() => void loadInvitations()}
          />
          {invitations.data?.map((invitation) => (
            <div key={invitation.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="truncate font-semibold">{invitation.email}</p><p className="truncate text-xs text-muted-foreground">{invitation.collaborationName} · {invitation.deliveryStatus}</p></div>
              <Button size="sm" variant="outline" disabled={busy === `invitation:${invitation.id}`} onClick={() => void revokeInvitation(invitation)}>Revoke</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card aria-label="Infrastructure design resources">
        <CardHeader className="pb-3"><CardTitle className="text-base">Infrastructure design</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <PanelFeedback
            label="Infrastructure design"
            state={infrastructure}
            isEmpty={(hasDesign) => !hasDesign}
            onRetry={() => void loadInfrastructure()}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-semibold">
              {infrastructure.data === null
                ? infrastructure.status === 'error' ? 'Infrastructure state unknown' : 'Checking saved design…'
                : infrastructure.status === 'stale'
                  ? infrastructure.data ? 'Last known: saved design' : 'Last known: no saved design'
                  : infrastructure.data ? 'Saved design' : 'No saved design'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild><Link href="/labs">Open</Link></Button>
              {infrastructure.data === true && (
                <Button size="sm" variant="destructive" disabled={busy === 'infrastructure-design'} onClick={() => void deleteInfrastructureDesign()}><Trash2 className="h-4 w-4" /> Reset</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
