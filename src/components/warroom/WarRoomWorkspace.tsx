'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Loader2,
  Monitor,
  Network,
  RefreshCw,
  Server,
  Terminal,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { ControlLeasePanel, type LiveWorkspaceControlState } from '@/components/live-workspace/ControlLeasePanel';
import { TopologyNodeIcon } from '@/components/operations/OperationVisuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Operation, OperationTopologyKind } from '@/lib/operations/catalog';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Role = 'owner' | 'instructor' | 'learner' | 'observer';
type Surface = 'terminal' | 'desktop';
type ResourceType = 'lab-instance' | 'academy-course' | 'infrastructure-design' | 'storyboard' | 'vault-item';

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

type Participant = {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl?: string | null;
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
  accessMode: Surface | null;
};

type AttachableResource = {
  id: string;
  type: ResourceType;
  label: string;
  accessMode: Surface | null;
  attached: boolean;
};

type WorkspaceDetail = {
  viewerId: string;
  workspace: {
    id: string;
    name: string;
    description: string;
    ownerId: string;
    role: Role;
    isOwner: boolean;
    capabilities: Capabilities;
  };
  participants: Participant[];
  resources: Resource[];
  attachableResources: AttachableResource[];
  control: LiveWorkspaceControlState;
};

type RunNode = {
  id: string;
  key: string;
  label: string;
  role: 'operator' | 'target' | 'infrastructure';
  osFamily: string;
  status: string;
  computeStatus?: string;
  readiness?: string;
  privateIp: string | null;
  labInstanceId: string | null;
};

type Run = {
  id: string;
  operationSlug: string;
  mode: string;
  status: string;
  expiresAt?: string;
  metadata?: { lifecycleState?: string; domain?: string };
  nodes: RunNode[];
};

type ContextResponse = {
  workspaceId: string | null;
  canCreateWorkspace: boolean;
  run: Run;
};

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Host',
  instructor: 'Instructor',
  learner: 'Player',
  observer: 'Observer',
};

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function nodeKind(node: RunNode): OperationTopologyKind {
  if (node.role === 'operator') return 'operator';
  if (node.role === 'target' && node.osFamily.toLowerCase().includes('windows')) return 'workstation';
  return 'server';
}

function nodeStatus(node: RunNode) {
  if (node.status === 'running') return 'Ready';
  if (node.status === 'failed') return 'Failed';
  if (node.status === 'destroyed' || node.status === 'destroying') return 'Stopping';
  if (node.computeStatus === 'running') return 'Initializing';
  return 'Provisioning';
}

function resourceStatus(detail: WorkspaceDetail, resource: Resource) {
  const lease = detail.control.leases.find((item) => item.bindingId === resource.id && item.surface === resource.accessMode);
  if (lease) {
    if (lease.participantId === detail.viewerId) return 'You have control';
    if (lease.surface === 'terminal' && detail.workspace.capabilities.observe) return `Watching ${lease.participantName}`;
    return `${lease.participantName} controls`;
  }
  const pending = detail.control.requests.find((item) => item.status === 'pending' && item.bindingId === resource.id && item.participantId === detail.viewerId);
  if (pending) return 'Control requested';
  return 'Ready to collaborate';
}

export default function WarRoomWorkspace({
  operation,
  runId,
  initialWorkspaceId,
}: {
  operation: Operation;
  runId: string;
  initialWorkspaceId?: string;
}) {
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(initialWorkspaceId || null);
  const [canCreateWorkspace, setCanCreateWorkspace] = React.useState(false);
  const [run, setRun] = React.useState<Run | null>(null);
  const [detail, setDetail] = React.useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = React.useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [contributionId, setContributionId] = React.useState('');

  const loadContext = React.useCallback(async () => {
    const response = await fetch(`/api/warroom/runs/${encodeURIComponent(runId)}/workspace`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await apiError(response, 'Could not load WarRoom Operation'));
    const next = await response.json() as ContextResponse;
    setWorkspaceId(next.workspaceId);
    setCanCreateWorkspace(next.canCreateWorkspace);
    setRun(next.run);
    return next;
  }, [runId]);

  const loadDetail = React.useCallback(async (id: string) => {
    const response = await fetch(`/api/live-workspaces/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await apiError(response, 'Could not load WarRoom team state'));
    const next = await response.json() as WorkspaceDetail;
    setDetail(next);
    const labs = next.resources.filter((resource) => resource.type === 'lab-instance');
    setSelectedResourceId((current) => current && labs.some((resource) => resource.id === current)
      ? current
      : labs.find((resource) => resource.resourceOwnerId === next.viewerId)?.id || labs[0]?.id || null);
    const available = next.attachableResources.filter((resource) => resource.type === 'lab-instance' && !resource.attached);
    setContributionId((current) => available.some((resource) => resource.id === current) ? current : available[0]?.id || '');
    return next;
  }, []);

  const refreshAll = React.useCallback(async (quiet = false) => {
    try {
      const context = await loadContext();
      if (context.workspaceId) await loadDetail(context.workspaceId);
      else setDetail(null);
      if (!quiet) setError(null);
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : 'Could not load WarRoom');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [loadContext, loadDetail]);

  React.useEffect(() => {
    void refreshAll();
    const timer = window.setInterval(() => void refreshAll(true), 15_000);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  async function ensureWorkspace() {
    setBusy('workspace');
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/warroom/runs/${encodeURIComponent(runId)}/workspace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not link team workspace'));
      const body = await response.json() as { workspaceId: string };
      setWorkspaceId(body.workspaceId);
      await loadDetail(body.workspaceId);
      setCanCreateWorkspace(false);
      toast.success('WarRoom team workspace linked.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not link team workspace');
    } finally {
      setBusy(null);
    }
  }

  async function inviteParticipant() {
    if (!workspaceId || !inviteEmail.trim() || !detail) return;
    if (detail.participants.length >= 4) {
      toast.error('WarRoom supports up to four participants.');
      return;
    }
    setBusy('invite');
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/collaborations/${encodeURIComponent(workspaceId)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not invite participant'));
      setInviteEmail('');
      await loadDetail(workspaceId);
      toast.success('Participant added as Observer. Assign Player when they are ready to contribute.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not invite participant');
    } finally {
      setBusy(null);
    }
  }

  async function updateRole(userId: string, role: Exclude<Role, 'owner'>) {
    if (!workspaceId) return;
    setBusy(`role:${userId}`);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${encodeURIComponent(workspaceId)}/participants/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not update participant role'));
      await loadDetail(workspaceId);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update participant role');
    } finally {
      setBusy(null);
    }
  }

  async function contributeLab() {
    if (!workspaceId || !contributionId) return;
    setBusy('contribute');
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${encodeURIComponent(workspaceId)}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ resourceType: 'lab-instance', resourceId: contributionId }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not contribute Cyber Lab'));
      await loadDetail(workspaceId);
      toast.success('Cyber Lab contributed to the WarRoom.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not contribute Cyber Lab');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-72 items-center justify-center rounded-xl border text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading live WarRoom…</div>;
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex min-h-60 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="font-medium">Could not open this WarRoom</p>
          <p className="max-w-lg text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => { setLoading(true); void refreshAll(); }}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (!workspaceId || !detail) {
    return (
      <Card>
        <CardContent className="flex min-h-60 flex-col items-center justify-center gap-3 p-6 text-center">
          <UsersRound className="h-8 w-8 text-primary" />
          <div>
            <p className="font-semibold">Operation is running; the team workspace is not linked yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">The Operation remains intact. Link its existing Live Workspace collaboration layer to continue in WarRoom.</p>
          </div>
          {canCreateWorkspace ? (
            <Button onClick={() => void ensureWorkspace()} disabled={busy === 'workspace'}>
              {busy === 'workspace' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UsersRound className="mr-2 h-4 w-4" />}
              Link team workspace
            </Button>
          ) : <Badge variant="outline">Waiting for the Operation host</Badge>}
        </CardContent>
      </Card>
    );
  }

  const labs = detail.resources.filter((resource) => resource.type === 'lab-instance');
  const availableLabs = detail.attachableResources.filter((resource) => resource.type === 'lab-instance' && !resource.attached);
  const selectedResource = labs.find((resource) => resource.id === selectedResourceId) || null;
  const participantSlots: Array<Participant | null> = [...detail.participants.slice(0, 4)];
  while (participantSlots.length < 4) participantSlots.push(null);
  const selectedControl: LiveWorkspaceControlState = selectedResource ? {
    ...detail.control,
    requests: detail.control.requests.filter((request) => request.bindingId === selectedResource.id),
    leases: detail.control.leases.filter((lease) => lease.bindingId === selectedResource.id),
  } : { ...detail.control, requests: [], leases: [] };
  const lifecyclePaused = run?.metadata?.lifecycleState === 'paused';

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_310px]">
      <div className="space-y-3">
        <Card className="overflow-hidden">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Network className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">{operation.codename} — live environment</span>
              <Badge variant={run?.status === 'running' && !lifecyclePaused ? 'default' : 'outline'}>
                {lifecyclePaused ? 'Paused' : run?.status === 'running' ? 'Environment ready' : 'Environment initializing'}
              </Badge>
              {run?.metadata?.domain ? <Badge variant="secondary">{run.metadata.domain}</Badge> : null}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void refreshAll()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
            </div>
            <p className="text-xs text-muted-foreground">This is the same authoritative Operation topology shown in Cyber Lab. WarRoom adds people, contributed labs and lease-gated collaboration without creating a second runtime.</p>

            <div className="grid gap-2 md:grid-cols-3">
              {(run?.nodes || []).map((node) => (
                <div key={node.id} className="rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary"><TopologyNodeIcon kind={nodeKind(node)} className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{node.label}</span>
                    <Badge variant={node.status === 'running' ? 'default' : 'outline'} className="text-[9px]">{nodeStatus(node)}</Badge>
                  </div>
                  <p className="mt-2 text-[10px] capitalize text-muted-foreground">{node.osFamily} · {node.role}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{node.privateIp || 'Private IP pending'}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm"><UsersRound className="h-4 w-4" />Team stations</CardTitle>
              <Badge variant="outline">{detail.participants.length}/4 connected</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              {participantSlots.map((participant, slot) => {
                if (!participant) {
                  return (
                    <div key={`empty:${slot}`} className="min-h-36 rounded-xl border border-dashed p-3 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-full border text-[10px] font-semibold">P{slot + 1}</span>
                        <div><p className="text-xs font-medium text-foreground">Waiting for player</p><p className="text-[10px]">Invite a teammate to fill this station.</p></div>
                      </div>
                    </div>
                  );
                }
                const participantLabs = labs.filter((resource) => resource.resourceOwnerId === participant.id);
                const canManageRole = detail.workspace.capabilities.manageParticipants && participant.role !== 'owner';
                return (
                  <div key={participant.id} className="min-h-36 rounded-xl border p-3">
                    <div className="flex items-start gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{initials(participant.displayName)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-xs font-semibold">{participant.displayName}</p>
                          {participant.id === detail.viewerId ? <Badge variant="secondary" className="text-[9px]">You</Badge> : null}
                        </div>
                        {canManageRole ? (
                          <select
                            className="mt-1 h-7 rounded-md border bg-background px-1.5 text-[10px]"
                            value={participant.role}
                            disabled={busy === `role:${participant.id}`}
                            onChange={(event) => void updateRole(participant.id, event.target.value as Exclude<Role, 'owner'>)}
                          >
                            <option value="observer">Observer</option>
                            <option value="learner">Player</option>
                            {detail.workspace.isOwner ? <option value="instructor">Instructor</option> : null}
                          </select>
                        ) : <p className="mt-1 text-[10px] text-muted-foreground">{ROLE_LABELS[participant.role]}</p>}
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      {participantLabs.length === 0 ? (
                        <div className="rounded-lg border border-dashed px-2.5 py-2 text-[10px] text-muted-foreground">No Cyber Lab contributed.</div>
                      ) : participantLabs.map((resource) => (
                        <button
                          key={resource.id}
                          type="button"
                          onClick={() => setSelectedResourceId(resource.id)}
                          className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${selectedResourceId === resource.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'}`}
                        >
                          <div className="flex items-center gap-1.5 text-[10px] font-medium">
                            {resource.accessMode === 'desktop' ? <Monitor className="h-3.5 w-3.5" /> : <Terminal className="h-3.5 w-3.5" />}
                            <span className="min-w-0 flex-1 truncate">{resource.label}</span>
                          </div>
                          <p className="mt-1 text-[9px] text-muted-foreground">{resourceStatus(detail, resource)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-2 border-t pt-3 lg:grid-cols-2">
              {detail.workspace.capabilities.manageParticipants && detail.participants.length < 4 ? (
                <div className="flex gap-2">
                  <Input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teammate@example.com" type="email" className="h-9" />
                  <Button size="sm" variant="outline" onClick={() => void inviteParticipant()} disabled={busy === 'invite' || !inviteEmail.trim()}>
                    {busy === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}<span className="sr-only">Invite</span>
                  </Button>
                </div>
              ) : <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4" />Team slots are managed by the host.</div>}

              {detail.workspace.capabilities.collaborate && availableLabs.length > 0 ? (
                <div className="flex gap-2">
                  <select className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs" value={contributionId} onChange={(event) => setContributionId(event.target.value)}>
                    {availableLabs.map((resource) => <option key={resource.id} value={resource.id}>{resource.label}</option>)}
                  </select>
                  <Button size="sm" variant="outline" onClick={() => void contributeLab()} disabled={busy === 'contribute' || !contributionId}>
                    {busy === 'contribute' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />} Contribute
                  </Button>
                </div>
              ) : <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4" />No unattached Cyber Lab available.</div>}
            </div>
          </CardContent>
        </Card>

        {selectedResource ? (
          <ControlLeasePanel
            workspaceId={workspaceId}
            viewerId={detail.viewerId}
            capabilities={detail.workspace.capabilities}
            resources={[selectedResource]}
            control={selectedControl}
            onRefresh={async () => { await loadDetail(workspaceId); }}
          />
        ) : (
          <Card><CardContent className="p-5 text-center text-sm text-muted-foreground">Select or contribute a Cyber Lab to expose its real View / Assist / Control state here.</CardContent></Card>
        )}
      </div>

      <aside className="space-y-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Objectives</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {operation.objectives.map((objective, index) => (
              <div key={objective} className="flex items-start gap-2 rounded-md border px-2.5 py-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] tabular-nums">{index + 1}</span>
                <span className="text-[11px] leading-4">{objective}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Evidence</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {operation.evidence.map((item) => <p key={item} className="text-[11px] text-muted-foreground">• {item}</p>)}
            <div className="space-y-2 border-t pt-3">
              {detail.workspace.isOwner ? (
                <Button asChild size="sm" variant="outline" className="w-full"><Link href={`/labs?operation=${encodeURIComponent(operation.slug)}&mode=warroom&run=${encodeURIComponent(runId)}`}>Open Cyber Lab</Link></Button>
              ) : null}
              <Button asChild size="sm" variant="ghost" className="w-full"><Link href="/live">Advanced Live Workspace</Link></Button>
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
