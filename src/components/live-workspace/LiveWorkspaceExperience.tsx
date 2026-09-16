'use client';

import * as React from 'react';
import { ArrowLeft, Link2, ListChecks, Loader2, Plus, RadioTower, RefreshCw, UsersRound, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCollaborationRealtime } from '@/lib/collab/use-realtime';
import {
  getLiveWorkspaceFreshness,
  liveWorkspaceFallbackInterval,
  shouldReconcileLiveWorkspaceOnVisibility,
} from '@/lib/live-workspace/freshness';
import { getCsrfToken } from '@/lib/security/csrf-client';
import LiveWorkspaceCoordinationPanel from './LiveWorkspaceCoordinationPanel';
import LiveWorkspaceParticipantCard, {
  type LiveWorkspaceAvailability,
  type LiveWorkspaceRole,
} from './LiveWorkspaceParticipantCard';
import LiveWorkspaceResourceCard, {
  type LiveWorkspaceResourceType,
} from './LiveWorkspaceResourceCard';

type Role = LiveWorkspaceRole;
type ResourceType = LiveWorkspaceResourceType;

type Capabilities = {
  observe: boolean;
  collaborate: boolean;
  requestControl: boolean;
  grantControl: boolean;
  manageParticipants: boolean;
  manageResources: boolean;
  eligibleForTerminalControl: boolean;
  eligibleForDesktopControl: boolean;
};

type WorkspaceListItem = {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  role: Role;
  isOwner: boolean;
  capabilities: Capabilities;
};

type Participant = {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  collaborationStatus: LiveWorkspaceAvailability;
  collaborationStatusMessage: string | null;
  role: Role;
  capabilities: Capabilities;
};

type Resource = {
  id: string;
  type: ResourceType;
  resourceId: string;
  resourceOwnerId: string;
  resourceOwnerName: string;
  label: string;
  accessMode: 'terminal' | 'desktop' | null;
  ownershipTransferred: false;
};

type AttachableResource = {
  id: string;
  type: ResourceType;
  label: string;
  accessMode: 'terminal' | 'desktop' | null;
  attached: boolean;
};

type Detail = {
  viewerId: string;
  workspace: WorkspaceListItem;
  participants: Participant[];
  resources: Resource[];
  attachableResources: AttachableResource[];
};

const RESOURCE_LABELS: Record<ResourceType, string> = {
  'lab-instance': 'Cyber Lab',
  'academy-course': 'Academy course',
  'infrastructure-design': 'Infrastructure design',
  storyboard: 'Board',
  'vault-item': 'Vault item',
};

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  instructor: 'Instructor',
  learner: 'Learner',
  observer: 'Observer',
};

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

export default function LiveWorkspaceExperience() {
  const [workspaces, setWorkspaces] = React.useState<WorkspaceListItem[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selectedIdRef = React.useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const [detail, setDetail] = React.useState<Detail | null>(null);
  const detailRef = React.useRef<Detail | null>(null);
  detailRef.current = detail;
  const detailRequestRef = React.useRef(0);
  const hiddenAtRef = React.useRef<number | null>(null);
  const previousRealtimeStateRef = React.useRef<'disabled' | 'connecting' | 'connected' | 'disconnected'>('disabled');

  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = React.useState<number | null>(null);
  const [freshnessNow, setFreshnessNow] = React.useState(0);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [mobileSection, setMobileSection] = React.useState<'plan' | 'people' | 'resources'>('plan');
  const [coordinationRevision, setCoordinationRevision] = React.useState(0);

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [resourceType, setResourceType] = React.useState<ResourceType>('lab-instance');
  const [resourceId, setResourceId] = React.useState('');

  const loadList = React.useCallback(async () => {
    const response = await fetch('/api/live-workspaces', { cache: 'no-store' });
    if (!response.ok) throw new Error(await apiError(response, 'Could not load Live Workspaces'));
    const body = await response.json() as { workspaces: WorkspaceListItem[] };
    setWorkspaces(body.workspaces);
    if (body.workspaces.length === 0) setShowCreate(true);
    setSelectedId((current) => {
      const nextId = current && body.workspaces.some((item) => item.id === current)
        ? current
        : body.workspaces[0]?.id || null;
      selectedIdRef.current = nextId;
      return nextId;
    });
  }, []);

  const loadDetail = React.useCallback(async (id: string) => {
    const requestId = ++detailRequestRef.current;
    const response = await fetch(`/api/live-workspaces/${id}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await apiError(response, 'Could not load Live Workspace'));
    const next = await response.json() as Detail;
    if (selectedIdRef.current === id && requestId === detailRequestRef.current) {
      const syncedAt = Date.now();
      detailRef.current = next;
      setDetail(next);
      setDetailError(null);
      setSyncError(null);
      setLastSuccessfulSyncAt(syncedAt);
      setFreshnessNow(syncedAt);
      setCoordinationRevision((value) => value + 1);
    }
    return next;
  }, []);

  const reconcileWorkspace = React.useCallback(async (id: string, options: { refreshList?: boolean } = {}) => {
    let detailFailure: unknown = null;
    try {
      await loadDetail(id);
    } catch (error) {
      detailFailure = error;
    }

    if (options.refreshList || detailFailure) {
      try {
        await loadList();
      } catch (error) {
        console.warn('[oxsig] Live Workspace list reconciliation deferred:', error);
      }
    }

    if (!detailFailure || selectedIdRef.current !== id) return;
    const message = detailFailure instanceof Error ? detailFailure.message : 'Could not refresh Live Workspace';
    if (detailRef.current) setSyncError(message);
    else setDetailError(message);
    setFreshnessNow(Date.now());
  }, [loadDetail, loadList]);

  const realtimeCallbacks = React.useMemo(() => ({
    onMembersChanged: () => {
      const id = selectedIdRef.current;
      if (id) void reconcileWorkspace(id, { refreshList: true });
    },
    onSessionChanged: () => {
      const id = selectedIdRef.current;
      if (id) void reconcileWorkspace(id);
    },
  }), [reconcileWorkspace]);

  const realtime = useCollaborationRealtime(selectedId, realtimeCallbacks);

  React.useEffect(() => {
    void loadList()
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Could not load Live Workspaces'))
      .finally(() => setLoading(false));
  }, [loadList]);

  React.useEffect(() => {
    detailRequestRef.current += 1;
    setMobileSection('plan');
    if (!selectedId) {
      detailRef.current = null;
      setDetail(null);
      setDetailError(null);
      setSyncError(null);
      setLastSuccessfulSyncAt(null);
      setDetailLoading(false);
      return;
    }

    detailRef.current = null;
    setDetail(null);
    setDetailError(null);
    setSyncError(null);
    setLastSuccessfulSyncAt(null);
    setDetailLoading(true);
    const requestedId = selectedId;
    void loadDetail(requestedId)
      .catch((error) => {
        if (selectedIdRef.current === requestedId) {
          setDetailError(error instanceof Error ? error.message : 'Could not load Live Workspace');
        }
      })
      .finally(() => {
        if (selectedIdRef.current === requestedId) setDetailLoading(false);
      });
  }, [loadDetail, selectedId]);

  React.useEffect(() => {
    const previous = previousRealtimeStateRef.current;
    previousRealtimeStateRef.current = realtime.state;
    setFreshnessNow(Date.now());
    if (selectedId && realtime.state === 'connected' && previous !== 'connected') {
      void reconcileWorkspace(selectedId, { refreshList: true });
    }
  }, [realtime.state, reconcileWorkspace, selectedId]);

  React.useEffect(() => {
    if (!selectedId) return;
    const intervalMs = liveWorkspaceFallbackInterval(realtime.state);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setFreshnessNow(Date.now());
      void reconcileWorkspace(selectedId);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [realtime.state, reconcileWorkspace, selectedId]);

  React.useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }
      const now = Date.now();
      setFreshnessNow(now);
      const id = selectedIdRef.current;
      if (id && shouldReconcileLiveWorkspaceOnVisibility({
        realtimeState: realtime.state,
        hiddenAt: hiddenAtRef.current,
        lastSuccessfulSyncAt,
        now,
      })) {
        void reconcileWorkspace(id, { refreshList: true });
      }
      hiddenAtRef.current = null;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [lastSuccessfulSyncAt, realtime.state, reconcileWorkspace]);

  React.useEffect(() => {
    if (!detail) {
      setResourceId('');
      return;
    }
    const canAttach = detail.workspace.capabilities.manageResources || detail.workspace.capabilities.collaborate;
    if (!canAttach) {
      setResourceId('');
      return;
    }
    if (!detail.workspace.capabilities.manageResources && resourceType !== 'lab-instance') {
      setResourceType('lab-instance');
      return;
    }
    const options = detail.attachableResources.filter((resource) => resource.type === resourceType && !resource.attached);
    setResourceId((current) => options.some((resource) => resource.id === current) ? current : options[0]?.id || '');
  }, [detail, resourceType]);

  async function createWorkspace() {
    if (!name.trim()) return;
    setBusy('create');
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/live-workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not create Live Workspace'));
      const body = await response.json() as { workspace: WorkspaceListItem };
      await loadList();
      setSelectedId(body.workspace.id);
      setShowCreate(false);
      setName('');
      setDescription('');
      toast.success('Workspace created.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create Live Workspace');
    } finally {
      setBusy(null);
    }
  }

  async function inviteParticipant() {
    if (!selectedId || !inviteEmail.trim()) return;
    setBusy('invite');
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/collaborations/${selectedId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not invite participant'));
      setInviteEmail('');
      await loadDetail(selectedId);
      toast.success('Participant added as Observer.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not invite participant');
    } finally {
      setBusy(null);
    }
  }

  async function updateRole(userId: string, role: Exclude<Role, 'owner'>) {
    if (!selectedId) return;
    setBusy(`role:${userId}`);
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${selectedId}/participants/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not update participant role'));
      await loadDetail(selectedId);
      toast.success('Participant role updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update participant role');
    } finally {
      setBusy(null);
    }
  }

  async function removeParticipant(userId: string) {
    if (!selectedId || !detail) return;
    const leaving = userId === detail.viewerId;
    setBusy(`participant:${userId}`);
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${selectedId}/participants/${userId}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': token },
      });
      if (!response.ok) throw new Error(await apiError(response, leaving ? 'Could not leave workspace' : 'Could not remove participant'));
      if (leaving) {
        detailRef.current = null;
        setDetail(null);
        selectedIdRef.current = null;
        setSelectedId(null);
        await loadList();
        toast.success('Left workspace.');
      } else {
        await loadDetail(selectedId);
        toast.success('Participant removed.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (leaving ? 'Could not leave workspace' : 'Could not remove participant'));
    } finally {
      setBusy(null);
    }
  }

  async function attachResource() {
    if (!selectedId || !resourceId) return;
    setBusy('resource');
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${selectedId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ resourceType, resourceId }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not attach resource'));
      await loadDetail(selectedId);
      toast.success(resourceType === 'lab-instance' ? 'Lab contributed to the workspace.' : 'Resource attached.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not attach resource');
    } finally {
      setBusy(null);
    }
  }

  async function detachResource(bindingId: string) {
    if (!selectedId) return;
    setBusy(`resource:${bindingId}`);
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${selectedId}/resources`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ bindingId }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not detach resource'));
      await loadDetail(selectedId);
      toast.success('Resource detached.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not detach resource');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>;
  }

  const canAttachResources = Boolean(detail && (detail.workspace.capabilities.manageResources || detail.workspace.capabilities.collaborate));
  const availableResources = detail?.attachableResources.filter((resource) => resource.type === resourceType && !resource.attached) || [];
  const onlineSet = new Set(realtime.onlineIds);
  const onlineParticipants = detail?.participants.filter((participant) => onlineSet.has(participant.id)).length || 0;
  const freshness = getLiveWorkspaceFreshness({
    realtimeState: realtime.state,
    lastSuccessfulSyncAt,
    now: freshnessNow || Date.now(),
    refreshFailed: Boolean(syncError),
  });
  const freshnessLabel = freshness === 'current' ? 'Current' : freshness === 'reconnecting' ? 'Reconnecting' : freshness === 'stale' ? 'Stale' : 'Refresh failed';
  const freshnessTitle = lastSuccessfulSyncAt ? `Last successful sync ${new Date(lastSuccessfulSyncAt).toLocaleTimeString()}` : 'Waiting for the first successful sync';

  return (
    <div className="w-full min-w-0">
      <div className="grid min-h-[calc(100dvh-8rem)] gap-3 md:grid-cols-[270px_minmax(0,1fr)]">
        <aside className={selectedId ? 'hidden md:block' : 'block'}>
          <Card className="h-full min-h-[28rem]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Live Workspaces</CardTitle>
                  <CardDescription className="mt-1 text-xs">Shared people and technical resources.</CardDescription>
                </div>
                <Button size="sm" variant={showCreate ? 'secondary' : 'outline'} onClick={() => setShowCreate((value) => !value)}><Plus className="h-4 w-4" /> New</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {showCreate && (
                <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                  <div className="space-y-1.5">
                    <label htmlFor="live-workspace-name" className="text-xs font-medium">Name</label>
                    <Input id="live-workspace-name" value={name} onChange={(event) => setName(event.target.value.slice(0, 80))} placeholder="New workspace" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="live-workspace-description" className="text-xs font-medium">Description</label>
                    <Textarea id="live-workspace-description" className="min-h-20 resize-none" value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} placeholder="Optional" />
                  </div>
                  <Button className="w-full" onClick={() => void createWorkspace()} disabled={busy === 'create' || !name.trim()}>{busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create</Button>
                </div>
              )}

              {workspaces.length === 0 && !showCreate && <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">No workspaces yet.</p>}
              <div className="space-y-2">
                {workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    aria-pressed={selectedId === workspace.id}
                    onClick={() => setSelectedId(workspace.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === workspace.id ? 'bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/30'}`}
                  >
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{workspace.name}</span><Badge variant="secondary" className="text-[9px]">{ROLE_LABELS[workspace.role]}</Badge></div>
                    {workspace.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{workspace.description}</p>}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </aside>

        <main className={selectedId ? 'min-w-0 space-y-3' : 'hidden min-w-0 md:block'}>
          {detailLoading ? (
            <Card><CardContent className="flex min-h-80 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</CardContent></Card>
          ) : detailError ? (
            <Card className="border-destructive/30"><CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 p-6 text-center"><p className="font-medium">Could not open workspace</p><p className="max-w-md text-sm text-muted-foreground">{detailError}</p>{selectedId && <Button variant="outline" onClick={() => void reconcileWorkspace(selectedId, { refreshList: true })}><RefreshCw className="h-4 w-4" /> Retry</Button>}</CardContent></Card>
          ) : !detail ? (
            <Card><CardContent className="flex min-h-80 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><RadioTower className="h-7 w-7 opacity-50" /><span>{workspaces.length ? 'Select a workspace' : 'No workspace selected'}</span></CardContent></Card>
          ) : (
            <>
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 md:hidden" aria-label="Back to workspaces" onClick={() => setSelectedId(null)}><ArrowLeft className="h-4 w-4" /></Button>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2"><h1 className="truncate text-base font-semibold sm:text-lg">{detail.workspace.name}</h1><Badge variant="secondary" className="shrink-0 text-[9px]">{ROLE_LABELS[detail.workspace.role]}</Badge></div>
                        {detail.workspace.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{detail.workspace.description}</p>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant="outline" className="text-[9px]" title={syncError || freshnessTitle}>{freshnessLabel}</Badge>
                      {(freshness === 'stale' || freshness === 'refresh-error') && selectedId && <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Refresh Live Workspace" onClick={() => void reconcileWorkspace(selectedId, { refreshList: true })}><RefreshCw className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">{realtime.state === 'connected' ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5" />}{realtime.state === 'connected' ? 'Live' : realtime.state === 'connecting' ? 'Connecting' : 'Polling fallback'}</span>
                    <span className="inline-flex items-center gap-1.5"><UsersRound className="h-3.5 w-3.5" /> {onlineParticipants} online · {detail.participants.length} people</span>
                    <span className="inline-flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> {detail.resources.length} resources</span>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-3 gap-2 xl:hidden">
                <Button variant={mobileSection === 'plan' ? 'secondary' : 'outline'} onClick={() => setMobileSection('plan')}><ListChecks className="h-4 w-4" /> <span className="hidden sm:inline">Plan</span></Button>
                <Button variant={mobileSection === 'people' ? 'secondary' : 'outline'} onClick={() => setMobileSection('people')}><UsersRound className="h-4 w-4" /> <span className="hidden sm:inline">People</span></Button>
                <Button variant={mobileSection === 'resources' ? 'secondary' : 'outline'} onClick={() => setMobileSection('resources')}><Link2 className="h-4 w-4" /> <span className="hidden sm:inline">Resources</span></Button>
              </div>

              <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <LiveWorkspaceCoordinationPanel
                  workspaceId={detail.workspace.id}
                  refreshToken={coordinationRevision}
                  className={mobileSection === 'plan' ? 'block' : 'hidden xl:block'}
                />

                <Card className={mobileSection === 'people' ? 'block' : 'hidden xl:block'}>
                  <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4" /> People</CardTitle><CardDescription className="text-xs">Presence, availability and workspace roles.</CardDescription></CardHeader>
                  <CardContent className="space-y-3">
                    {detail.workspace.isOwner && (
                      <div className="rounded-xl border bg-muted/20 p-3">
                        <label htmlFor="live-participant-email" className="text-xs font-medium">Invite participant</label>
                        <div className="mt-1.5 flex gap-2"><Input id="live-participant-email" className="min-w-0 flex-1" type="email" autoComplete="email" placeholder="participant@example.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value.slice(0, 320))} /><Button variant="outline" onClick={() => void inviteParticipant()} disabled={busy === 'invite' || !inviteEmail.trim()}>{busy === 'invite' && <Loader2 className="h-4 w-4 animate-spin" />} Invite</Button></div>
                      </div>
                    )}
                    <div className="space-y-2">
                      {detail.participants.map((participant) => (
                        <LiveWorkspaceParticipantCard
                          key={participant.id}
                          participant={participant}
                          online={onlineSet.has(participant.id)}
                          viewerId={detail.viewerId}
                          canManage={detail.workspace.capabilities.manageParticipants}
                          managerIsOwner={detail.workspace.isOwner}
                          busy={busy === `participant:${participant.id}` || busy === `role:${participant.id}`}
                          onRoleChange={(role) => void updateRole(participant.id, role)}
                          onRemove={() => void removeParticipant(participant.id)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className={mobileSection === 'resources' ? 'block' : 'hidden xl:block'}>
                  <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" /> Resources</CardTitle><CardDescription className="text-xs">Open shared technical context directly from the workspace.</CardDescription></CardHeader>
                  <CardContent className="space-y-3">
                    {canAttachResources && (
                      <div className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-end xl:grid-cols-1">
                        <div className="space-y-1.5">
                          <label htmlFor="live-resource-type" className="text-xs font-medium">Type</label>
                          {detail.workspace.capabilities.manageResources ? (
                            <select id="live-resource-type" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={resourceType} onChange={(event) => setResourceType(event.target.value as ResourceType)}>
                              <option value="lab-instance">Cyber Lab</option>
                              <option value="academy-course">Academy course</option>
                              <option value="storyboard">Board</option>
                              <option value="vault-item">Vault item</option>
                              <option value="infrastructure-design">Infrastructure design</option>
                            </select>
                          ) : <div className="flex h-10 items-center rounded-md border bg-background px-2 text-sm">My Cyber Lab</div>}
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor="live-resource" className="text-xs font-medium">Resource</label>
                          <select id="live-resource" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={resourceId} onChange={(event) => setResourceId(event.target.value)} disabled={availableResources.length === 0}>
                            {availableResources.length === 0 ? <option value="">No available {RESOURCE_LABELS[resourceType].toLowerCase()}</option> : availableResources.map((resource) => <option key={`${resource.type}:${resource.id}`} value={resource.id}>{resource.label}{resource.accessMode ? ` · ${resource.accessMode}` : ''}</option>)}
                          </select>
                        </div>
                        <Button variant="outline" onClick={() => void attachResource()} disabled={busy === 'resource' || !resourceId}>{busy === 'resource' && <Loader2 className="h-4 w-4 animate-spin" />} {detail.workspace.capabilities.manageResources ? 'Attach' : 'Contribute'}</Button>
                      </div>
                    )}

                    {detail.resources.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">No resources attached yet.</p> : (
                      <div className="grid gap-2 2xl:grid-cols-2">
                        {detail.resources.map((resource) => (
                          <LiveWorkspaceResourceCard
                            key={resource.id}
                            resource={resource}
                            canDetach={detail.workspace.capabilities.manageResources || resource.resourceOwnerId === detail.viewerId}
                            busy={busy === `resource:${resource.id}`}
                            onDetach={() => void detachResource(resource.id)}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
