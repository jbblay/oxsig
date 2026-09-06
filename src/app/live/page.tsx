'use client';

import * as React from 'react';
import { Link2, Loader2, Plus, RadioTower, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { ControlLeasePanel, type LiveWorkspaceControlState } from '@/components/live-workspace/ControlLeasePanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Role = 'owner' | 'instructor' | 'learner' | 'observer';
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
  role: Role;
  capabilities: Capabilities;
};
type Resource = {
  id: string;
  type: 'lab-instance' | 'academy-course' | 'infrastructure-design';
  resourceId: string;
  resourceOwnerId: string;
  label: string;
  accessMode: 'terminal' | 'desktop' | null;
  ownershipTransferred: false;
};
type Detail = {
  viewerId: string;
  workspace: WorkspaceListItem;
  participants: Participant[];
  resources: Resource[];
  control: LiveWorkspaceControlState;
};

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

export default function LiveWorkspacePage() {
  const [workspaces, setWorkspaces] = React.useState<WorkspaceListItem[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [name, setName] = React.useState('Live Lab Session');
  const [description, setDescription] = React.useState('Collaborative technical learning workspace');
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [resourceType, setResourceType] = React.useState<Resource['type']>('lab-instance');
  const [resourceId, setResourceId] = React.useState('');

  const loadList = React.useCallback(async () => {
    const response = await fetch('/api/live-workspaces', { cache: 'no-store' });
    if (!response.ok) throw new Error(await apiError(response, 'Could not load Live Workspaces'));
    const body = await response.json() as { workspaces: WorkspaceListItem[] };
    setWorkspaces(body.workspaces);
    setSelectedId((current) => current && body.workspaces.some((item) => item.id === current)
      ? current
      : body.workspaces[0]?.id || null);
  }, []);

  const loadDetail = React.useCallback(async (id: string) => {
    const response = await fetch(`/api/live-workspaces/${id}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await apiError(response, 'Could not load Live Workspace'));
    setDetail(await response.json() as Detail);
  }, []);

  React.useEffect(() => {
    void loadList().catch((error) => toast.error(error instanceof Error ? error.message : 'Could not load Live Workspaces')).finally(() => setLoading(false));
  }, [loadList]);

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not load Live Workspace'));
  }, [loadDetail, selectedId]);

  async function createWorkspace() {
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
      toast.success('Live Workspace created. Joining or observing does not grant terminal or desktop control.');
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
      toast.success('Participant added. New Live Workspace members start as observers until explicitly promoted.');
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update participant role');
    } finally {
      setBusy(null);
    }
  }

  async function attachResource() {
    if (!selectedId || !resourceId.trim()) return;
    setBusy('resource');
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${selectedId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ resourceType, resourceId: resourceId.trim() }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not attach resource'));
      setResourceId('');
      await loadDetail(selectedId);
      toast.success('Resource attached without transferring ownership.');
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
      toast.success('Resource detached. Any active control lease for it was revoked.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not detach resource');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening Live Workspace…</div>;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 py-3">
      <section className="rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-purple-500/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><RadioTower className="h-5 w-5 text-primary" /><h1 className="text-2xl font-semibold">OXSIG Live Workspace</h1></div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Shared session identity, participants, roles and owner-bound technical resources. Observation and control remain separate: machine control requires an explicit, revocable, time-bounded lease.</p>
          </div>
          <Badge variant="outline">Control Leases v1 · transport disconnected</Badge>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Create workspace</CardTitle><CardDescription>Starts with you as owner.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={name} onChange={(event) => setName(event.target.value.slice(0, 80))} />
              <textarea className="min-h-20 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm" value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} />
              <Button className="w-full" onClick={() => void createWorkspace()} disabled={busy === 'create' || !name.trim()}>{busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Live Workspace</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Your workspaces</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {workspaces.length === 0 && <p className="text-xs text-muted-foreground">No Live Workspaces yet.</p>}
              {workspaces.map((workspace) => (
                <button key={workspace.id} type="button" onClick={() => setSelectedId(workspace.id)} className={`w-full rounded-xl border p-3 text-left ${selectedId === workspace.id ? 'bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/30'}`}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{workspace.name}</span><Badge variant="secondary" className="text-[10px]">{workspace.role}</Badge></div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{workspace.description || 'Technical live session'}</p>
                </button>
              ))}
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-4">
          {!detail ? (
            <Card><CardContent className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">Create or select a Live Workspace.</CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle>{detail.workspace.name}</CardTitle><CardDescription>{detail.workspace.description}</CardDescription></div><Badge>{detail.workspace.role}</Badge></div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs leading-5 text-muted-foreground">You can observe shared workspace state according to your role. An active control lease is a separate authorization object and still does not create a terminal/desktop transport in this slice.</p>
                </CardContent>
              </Card>

              <ControlLeasePanel
                workspaceId={detail.workspace.id}
                viewerId={detail.viewerId}
                capabilities={detail.workspace.capabilities}
                resources={detail.resources}
                control={detail.control}
                onRefresh={() => loadDetail(detail.workspace.id)}
              />

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4" /> Participants</CardTitle><CardDescription>Observe is not control. Generic invitees enter as observers until explicitly promoted.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {detail.workspace.isOwner && (
                    <div className="flex gap-2"><input className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" placeholder="participant@example.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value.slice(0, 320))} /><Button variant="outline" onClick={() => void inviteParticipant()} disabled={busy === 'invite' || !inviteEmail.trim()}>Invite</Button></div>
                  )}
                  {detail.participants.map((participant) => (
                    <div key={participant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                      <div><p className="text-sm font-semibold">{participant.displayName}</p><p className="text-xs text-muted-foreground">{participant.email || participant.id}</p></div>
                      <div className="flex items-center gap-2">
                        {participant.role === 'owner' || !detail.workspace.capabilities.manageParticipants ? <Badge variant="secondary">{participant.role}</Badge> : (
                          <select className="rounded-md border bg-background px-2 py-1 text-xs" value={participant.role} disabled={busy === `role:${participant.id}`} onChange={(event) => void updateRole(participant.id, event.target.value as Exclude<Role, 'owner'>)}>
                            <option value="observer">observer</option><option value="learner">learner</option><option value="instructor">instructor</option>
                          </select>
                        )}
                        <span className="text-[10px] text-muted-foreground">{participant.capabilities.requestControl ? 'may request control' : 'observe only'}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" /> Bound resources</CardTitle><CardDescription>Only workspace-owner assets can be attached. Binding never transfers ownership.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {detail.workspace.capabilities.manageResources && (
                    <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
                      <select className="rounded-md border bg-background px-2 py-2 text-sm" value={resourceType} onChange={(event) => setResourceType(event.target.value as Resource['type'])}><option value="lab-instance">Cyber Lab</option><option value="academy-course">Academy course</option><option value="infrastructure-design">Infrastructure design</option></select>
                      <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Owner-owned resource UUID" value={resourceId} onChange={(event) => setResourceId(event.target.value)} />
                      <Button variant="outline" onClick={() => void attachResource()} disabled={busy === 'resource' || !resourceId.trim()}>Attach</Button>
                    </div>
                  )}
                  {detail.resources.length === 0 && <p className="text-xs text-muted-foreground">No resources attached yet.</p>}
                  {detail.resources.map((resource) => (
                    <div key={resource.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-semibold">{resource.label}</p><p className="font-mono text-[10px] text-muted-foreground">{resource.type} · {resource.resourceId}{resource.accessMode ? ` · ${resource.accessMode}` : ''}</p></div><div className="flex items-center gap-2"><Badge variant="outline">ownership retained</Badge>{detail.workspace.capabilities.manageResources && <Button size="sm" variant="ghost" disabled={busy === `resource:${resource.id}`} onClick={() => void detachResource(resource.id)}>Detach</Button>}</div></div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
