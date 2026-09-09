'use client';

import * as React from 'react';
import { Link2, Loader2, Plus, RadioTower, RefreshCw, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { ControlLeasePanel, type LiveWorkspaceControlState } from '@/components/live-workspace/ControlLeasePanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
type ResourceType = 'lab-instance' | 'academy-course' | 'infrastructure-design' | 'storyboard' | 'vault-item';
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
  control: LiveWorkspaceControlState;
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

export default function LiveWorkspacePage() {
  const [workspaces, setWorkspaces] = React.useState<WorkspaceListItem[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selectedIdRef = React.useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
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
    setSelectedId((current) => current && body.workspaces.some((item) => item.id === current)
      ? current
      : body.workspaces[0]?.id || null);
  }, []);

  const loadDetail = React.useCallback(async (id: string) => {
    const response = await fetch(`/api/live-workspaces/${id}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await apiError(response, 'Could not load Live Workspace'));
    const next = await response.json() as Detail;
    if (selectedIdRef.current === id) setDetail(next);
    return next;
  }, []);

  React.useEffect(() => {
    void loadList()
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Could not load Live Workspaces'))
      .finally(() => setLoading(false));
  }, [loadList]);

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    const requestedId = selectedId;
    void loadDetail(requestedId)
      .catch((error) => {
        if (selectedIdRef.current === requestedId) setDetailError(error instanceof Error ? error.message : 'Could not load Live Workspace');
      })
      .finally(() => {
        if (selectedIdRef.current === requestedId) setDetailLoading(false);
      });
  }, [loadDetail, selectedId]);

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
        setDetail(null);
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

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>;

  const canAttachResources = Boolean(detail && (detail.workspace.capabilities.manageResources || detail.workspace.capabilities.collaborate));
  const availableResources = detail?.attachableResources.filter((resource) => resource.type === resourceType && !resource.attached) || [];

  return (
    <div className="w-full space-y-2">
      <div className="grid gap-3 md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className={selectedId ? 'hidden md:block' : ''}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Workspaces</CardTitle>
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

              {workspaces.length === 0 && !showCreate && <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">No workspaces</p>}
              {workspaces.map((workspace) => (
                <button key={workspace.id} type="button" aria-pressed={selectedId === workspace.id} onClick={() => setSelectedId(workspace.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === workspace.id ? 'bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/30'}`}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{workspace.name}</span><Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[workspace.role]}</Badge></div>
                  {workspace.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{workspace.description}</p>}
                </button>
              ))}
            </CardContent>
          </Card>
        </aside>

        <main className={selectedId ? 'space-y-4' : 'hidden space-y-4 md:block'}>
          {detailLoading ? (
            <Card><CardContent className="flex min-h-80 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</CardContent></Card>
          ) : detailError ? (
            <Card className="border-destructive/30"><CardContent className="flex min-h-80 flex-col items-center justify-center gap-3 p-6 text-center"><p className="font-medium">Could not open workspace</p><p className="max-w-md text-sm text-muted-foreground">{detailError}</p>{selectedId && <Button variant="outline" onClick={() => { const retryId = selectedId; setDetailError(null); setDetailLoading(true); void loadDetail(retryId).catch((error) => { if (selectedIdRef.current === retryId) setDetailError(error instanceof Error ? error.message : 'Could not load Live Workspace'); }).finally(() => { if (selectedIdRef.current === retryId) setDetailLoading(false); }); }}><RefreshCw className="h-4 w-4" /> Retry</Button>}</CardContent></Card>
          ) : !detail ? (
            <Card><CardContent className="flex min-h-80 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><RadioTower className="h-7 w-7 opacity-50" /><span>{workspaces.length ? 'Select a workspace' : 'No workspace selected'}</span></CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Button type="button" size="sm" variant="ghost" className="h-8 px-2 md:hidden" onClick={() => setSelectedId(null)}>Workspaces</Button>
                      <div className="min-w-0"><CardTitle className="truncate">{detail.workspace.name}</CardTitle>{detail.workspace.description && <CardDescription className="truncate">{detail.workspace.description}</CardDescription>}</div>
                    </div>
                    <Badge>{ROLE_LABELS[detail.workspace.role]}</Badge>
                  </div>
                </CardHeader>
              </Card>

              <ControlLeasePanel
                workspaceId={detail.workspace.id}
                viewerId={detail.viewerId}
                capabilities={detail.workspace.capabilities}
                resources={detail.resources}
                control={detail.control}
                onRefresh={() => loadDetail(detail.workspace.id).then(() => undefined)}
              />

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4" /> Participants</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {detail.workspace.isOwner && (
                    <div className="space-y-1.5">
                      <label htmlFor="live-participant-email" className="text-xs font-medium">Invite</label>
                      <div className="flex gap-2"><Input id="live-participant-email" className="min-w-0 flex-1" type="email" autoComplete="email" placeholder="participant@example.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value.slice(0, 320))} /><Button variant="outline" onClick={() => void inviteParticipant()} disabled={busy === 'invite' || !inviteEmail.trim()}>{busy === 'invite' && <Loader2 className="h-4 w-4 animate-spin" />} Invite</Button></div>
                    </div>
                  )}
                  {detail.participants.map((participant) => {
                    const canRemove = participant.role !== 'owner' && (detail.workspace.isOwner || participant.id === detail.viewerId);
                    const removing = busy === `participant:${participant.id}`;
                    return (
                      <div key={participant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                        <div><p className="text-sm font-semibold">{participant.displayName}</p><p className="text-xs text-muted-foreground">{participant.email || 'Participant'}</p></div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {participant.role === 'owner' || !detail.workspace.capabilities.manageParticipants ? <Badge variant="secondary">{ROLE_LABELS[participant.role]}</Badge> : <label className="sr-only" htmlFor={`role-${participant.id}`}>Role for {participant.displayName}</label>}
                          {participant.role !== 'owner' && detail.workspace.capabilities.manageParticipants && (
                            <select id={`role-${participant.id}`} aria-label={`Role for ${participant.displayName}`} className="rounded-md border bg-background px-2 py-1.5 text-xs" value={participant.role} disabled={busy === `role:${participant.id}` || removing} onChange={(event) => void updateRole(participant.id, event.target.value as Exclude<Role, 'owner'>)}>
                              <option value="observer">Observer</option>
                              <option value="learner">Learner</option>
                              {(detail.workspace.isOwner || participant.role === 'instructor') && <option value="instructor" disabled={!detail.workspace.isOwner}>Instructor</option>}
                            </select>
                          )}
                          <span className="text-[10px] text-muted-foreground">{participant.capabilities.requestControl ? 'Control eligible' : 'Observe only'}</span>
                          {canRemove && (
                            <Button size="sm" variant="ghost" disabled={removing} onClick={() => void removeParticipant(participant.id)}>
                              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : participant.id === detail.viewerId ? 'Leave' : 'Remove'}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" /> Resources</CardTitle>
                  <CardDescription>Owners can attach workspace resources. Learners and instructors can contribute their own running Cyber Lab.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {canAttachResources && (
                    <div className="grid gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end">
                      <div className="space-y-1.5">
                        <label htmlFor="live-resource-type" className="text-xs font-medium">Type</label>
                        {detail.workspace.capabilities.manageResources ? (
                          <select id="live-resource-type" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={resourceType} onChange={(event) => setResourceType(event.target.value as ResourceType)}>
                            <option value="lab-instance">Cyber Lab</option>
                            <option value="storyboard">Board</option>
                            <option value="vault-item">Vault item</option>
                            <option value="infrastructure-design">Infrastructure design</option>
                          </select>
                        ) : (
                          <div id="live-resource-type" className="flex h-10 items-center rounded-md border bg-background px-2 text-sm">My Cyber Lab</div>
                        )}
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
                  {detail.resources.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">No resources</p>}
                  {detail.resources.map((resource) => {
                    const canDetach = detail.workspace.capabilities.manageResources || resource.resourceOwnerId === detail.viewerId;
                    return (
                      <div key={resource.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                        <div>
                          <p className="text-sm font-semibold">{resource.label}</p>
                          <p className="text-xs text-muted-foreground">{RESOURCE_LABELS[resource.type]}{resource.accessMode ? ` · ${resource.accessMode === 'terminal' ? 'Terminal' : 'Desktop'}` : ''} · {resource.resourceOwnerName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Owner retained</Badge>
                          {canDetach && <Button size="sm" variant="ghost" disabled={busy === `resource:${resource.id}`} onClick={() => void detachResource(resource.id)}>{busy === `resource:${resource.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Detach'}</Button>}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
