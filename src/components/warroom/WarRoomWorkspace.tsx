'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  FileCheck2,
  Loader2,
  Monitor,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { type LiveWorkspaceControlState } from '@/components/live-workspace/ControlLeasePanel';
import OperationAiInstructor from '@/components/operations/OperationAiInstructor';
import { OperationRunStrip } from '@/components/operations/OperationRunStrip';
import { WarRoomConsole } from './WarRoomConsole';
import styles from './warroom.module.css';
import type { OperationAiNodeContext } from '@/lib/operations/ai-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Operation } from '@/lib/operations/catalog';
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
  const [selectionRevision, setSelectionRevision] = React.useState(0);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [contributionId, setContributionId] = React.useState('');
  const [aiNode, setAiNode] = React.useState<OperationAiNodeContext | null>(null);

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
    return <div className="flex min-h-72 items-center justify-center rounded-xl border border-red-500/20 bg-slate-950 text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin text-red-400" />Establishing WarRoom link…</div>;
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
      <Card className="border-red-500/20 bg-slate-950 text-slate-100">
        <CardContent className="flex min-h-60 flex-col items-center justify-center gap-3 p-6 text-center">
          <UsersRound className="h-8 w-8 text-red-400" />
          <div>
            <p className="font-semibold">Operation is running; the team workspace is not linked yet.</p>
            <p className="mt-1 text-sm text-slate-400">The Operation remains intact. Link its existing Live Workspace collaboration layer to continue in WarRoom.</p>
          </div>
          {canCreateWorkspace ? (
            <Button onClick={() => void ensureWorkspace()} disabled={busy === 'workspace'}>
              {busy === 'workspace' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UsersRound className="mr-2 h-4 w-4" />}
              Link team workspace
            </Button>
          ) : <Badge variant="outline" className="border-red-400/30 text-red-300">Waiting for the Operation host</Badge>}
        </CardContent>
      </Card>
    );
  }

  const labs = detail.resources.filter((resource) => resource.type === 'lab-instance');
  const availableLabs = detail.attachableResources.filter((resource) => resource.type === 'lab-instance' && !resource.attached);
  const participantSlots: Array<Participant | null> = [...detail.participants.slice(0, 4)];
  while (participantSlots.length < 4) participantSlots.push(null);
  const lifecyclePaused = run?.metadata?.lifecycleState === 'paused';

  return (
    <div className={`${styles.warroomGrid} grid gap-3 xl:grid-cols-[minmax(0,1fr)_350px]`}>
      <div className="min-w-0 space-y-3">
        <WarRoomConsole
          runId={runId}
          nodes={run?.nodes || []}
          status={run?.status || 'provisioning'}
          paused={Boolean(lifecyclePaused)}
          isOwner={detail.workspace.isOwner}
          selectedResourceId={selectedResourceId}
          selectionRevision={selectionRevision}
          onNodeChange={setAiNode}
          workspaceId={workspaceId}
          viewerId={detail.viewerId}
          capabilities={detail.workspace.capabilities}
          resources={labs}
          control={detail.control}
          onRefresh={async () => { await loadDetail(workspaceId); }}
        />

        <section className={`${styles.stationDeck} overflow-hidden rounded-xl border border-red-500/20 bg-slate-950 text-slate-100`} aria-label="Team cyber stations">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className={styles.liveDot} aria-hidden="true" />
            <div className="mr-auto">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-red-300">Live team grid</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Select a terminal or desktop station to route it into the mission console.</p>
            </div>
            <Badge variant="outline" className="border-white/15 bg-white/5 text-[9px] text-slate-300">{detail.participants.length}/4 connected</Badge>
          </div>

          <div className="grid gap-2 p-3 sm:grid-cols-2 2xl:grid-cols-4">
            {participantSlots.map((participant, slot) => {
              const participantLabs = participant ? labs.filter((resource) => resource.resourceOwnerId === participant.id) : [];
              const primarySurface = participantLabs[0]?.accessMode === 'desktop' ? 'desktop' : participantLabs.length > 0 ? 'terminal' : null;
              const canManageRole = Boolean(participant && detail.workspace.capabilities.manageParticipants && participant.role !== 'owner');
              return (
                <div key={participant?.id || `empty:${slot}`} className={`${styles.stationPanel} min-h-44 rounded-lg border border-white/10 bg-black/30 p-3`} data-surface={primarySurface || 'idle'}>
                  <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                    <span className="font-mono text-[11px] font-bold text-red-300">P{slot + 1}</span>
                    <span className="h-3 w-px bg-white/15" />
                    {primarySurface === 'desktop' ? <Monitor className="h-3.5 w-3.5 text-sky-300" /> : primarySurface === 'terminal' ? <Terminal className="h-3.5 w-3.5 text-emerald-300" /> : <Activity className="h-3.5 w-3.5 text-slate-600" />}
                    <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">{primarySurface || 'unassigned'}</span>
                    <span className={`ml-auto h-1.5 w-1.5 rounded-full ${participant ? 'bg-emerald-400' : 'bg-slate-700'}`} aria-hidden="true" />
                  </div>

                  {!participant ? (
                    <div className="flex min-h-32 flex-col justify-between pt-3">
                      <div>
                        <p className="font-mono text-[10px] text-slate-500">operator@warroom:~$</p>
                        <p className="mt-2 font-mono text-[10px] text-slate-400">awaiting teammate<span className={styles.cursor}>_</span></p>
                      </div>
                      <p className="text-[9px] uppercase tracking-wider text-slate-600">No operator assigned</p>
                    </div>
                  ) : (
                    <div className="pt-3">
                      <div className="flex items-start gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded border border-red-400/20 bg-red-500/10 font-mono text-[9px] font-bold text-red-200">{initials(participant.displayName)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-[11px] font-semibold text-slate-100">{participant.displayName}</p>
                            {participant.id === detail.viewerId ? <Badge variant="secondary" className="h-4 px-1 text-[8px]">You</Badge> : null}
                          </div>
                          {canManageRole ? (
                            <select
                              className="mt-1 h-6 rounded border border-white/10 bg-slate-950 px-1.5 font-mono text-[9px] text-slate-300"
                              value={participant.role}
                              disabled={busy === `role:${participant.id}`}
                              onChange={(event) => void updateRole(participant.id, event.target.value as Exclude<Role, 'owner'>)}
                            >
                              <option value="observer">Observer</option>
                              <option value="learner">Player</option>
                              {detail.workspace.isOwner ? <option value="instructor">Instructor</option> : null}
                            </select>
                          ) : <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-slate-500">{ROLE_LABELS[participant.role]}</p>}
                        </div>
                      </div>

                      <div className="mt-3 space-y-1.5">
                        {participantLabs.length === 0 ? (
                          <div className={`${styles.terminalPreview} rounded border border-dashed border-white/10 px-2.5 py-2 font-mono text-[9px] text-slate-500`}>
                            $ lab --attach<br /><span className="text-slate-600">waiting for contributed runtime</span><span className={styles.cursor}>_</span>
                          </div>
                        ) : participantLabs.map((resource) => {
                          const desktop = resource.accessMode === 'desktop';
                          const selected = selectedResourceId === resource.id;
                          return (
                            <button
                              key={resource.id}
                              type="button"
                              onClick={() => { setSelectedResourceId(resource.id); setSelectionRevision((value) => value + 1); }}
                              className={`${styles.stationResource} w-full overflow-hidden rounded border px-2.5 py-2 text-left transition ${selected ? 'border-red-400/60 bg-red-500/10' : 'border-white/10 bg-white/[0.025] hover:border-white/25 hover:bg-white/[0.05]'}`}
                              aria-pressed={selected}
                            >
                              <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-slate-300">
                                {desktop ? <Monitor className="h-3.5 w-3.5 text-sky-300" /> : <Terminal className="h-3.5 w-3.5 text-emerald-300" />}
                                <span className="min-w-0 flex-1 truncate">{resource.label}</span>
                                <span className={selected ? 'text-red-300' : 'text-slate-600'}>{selected ? 'ROUTED' : 'OPEN'}</span>
                              </div>
                              {desktop ? (
                                <div className={`${styles.desktopPreview} mt-2`} aria-hidden="true">
                                  <span /><span /><span />
                                </div>
                              ) : (
                                <p className="mt-2 truncate font-mono text-[9px] text-slate-500">$ {resourceStatus(detail, resource).toLowerCase()}<span className={styles.cursor}>_</span></p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid gap-2 border-t border-white/10 bg-black/20 p-3 lg:grid-cols-2">
            {detail.workspace.capabilities.manageParticipants && detail.participants.length < 4 ? (
              <div className="flex gap-2">
                <Input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teammate@example.com" type="email" className="h-9 border-white/10 bg-black/30 text-slate-100 placeholder:text-slate-600" />
                <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10" onClick={() => void inviteParticipant()} disabled={busy === 'invite' || !inviteEmail.trim()}>
                  {busy === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}<span className="sr-only">Invite</span>
                </Button>
              </div>
            ) : <div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-400" />Team slots are managed by the host.</div>}

            {detail.workspace.capabilities.collaborate && availableLabs.length > 0 ? (
              <div className="flex gap-2">
                <select className="h-9 min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-slate-200" value={contributionId} onChange={(event) => setContributionId(event.target.value)}>
                  {availableLabs.map((resource) => <option key={resource.id} value={resource.id}>{resource.label}</option>)}
                </select>
                <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10" onClick={() => void contributeLab()} disabled={busy === 'contribute' || !contributionId}>
                  {busy === 'contribute' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />} Contribute
                </Button>
              </div>
            ) : <div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-400" />No unattached Cyber Lab available.</div>}
          </div>
        </section>
      </div>

      <aside className={`${styles.missionRail} min-w-0 space-y-3 xl:sticky xl:top-4 xl:self-start`}>
        <div className="overflow-hidden rounded-xl border border-red-500/25 bg-slate-950 text-slate-100">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className={styles.liveDot} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-red-300">Mission intelligence</p>
              <p className="truncate text-xs font-semibold text-white">{operation.codename}</p>
            </div>
            <span className="font-mono text-[8px] uppercase tracking-widest text-slate-600">live</span>
          </div>

          <details className="group border-b border-white/10" open>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold text-white">
              <Crosshair className="h-4 w-4 text-red-300" />
              <span className="flex-1">Mission briefing</span>
              <span className="font-mono text-[9px] text-slate-500">{operation.objectives.length} OBJ</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 px-4 pb-4">
              <p className="text-[11px] leading-5 text-slate-400">{operation.summary}</p>
              <ol className="space-y-2">
                {operation.objectives.map((objective, index) => <li key={objective} className="flex gap-2 border-l border-red-500/25 pl-2 text-[10px] leading-4 text-slate-300"><span className="font-mono text-red-300">{String(index + 1).padStart(2, '0')}</span>{objective}</li>)}
              </ol>
            </div>
          </details>

          <details className="group border-b border-white/10">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold text-white">
              <FileCheck2 className="h-4 w-4 text-emerald-300" />
              <span className="flex-1">Evidence checklist</span>
              <span className="font-mono text-[9px] text-slate-500">{operation.evidence.length} ITEMS</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="space-y-2 px-4 pb-4">
              {operation.evidence.map((item) => <li key={item} className="flex gap-2 text-[10px] leading-4 text-slate-400"><FileCheck2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />{item}</li>)}
            </ul>
          </details>

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-amber-300" />
              <span className="flex-1">Environment &amp; control</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 px-4 pb-4 text-[10px] leading-4 text-slate-400">
              <p>This Operation shares its machines with Cyber Lab. Team stations attach people and contributed labs to the same mission.</p>
              <p>Request control to operate a shared terminal. Authorized teammates can observe output. Switching tabs closes the previous view; use Release control to hand over your lease.</p>
              <p>{detail.control.note}</p>
              <p>Windows machine terminals and desktops use the host’s Operation access. Shared desktop transport is not connected yet.</p>
              {detail.workspace.isOwner && <Button asChild size="sm" variant="outline" className="w-full border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"><Link href={`/labs?operation=${encodeURIComponent(operation.slug)}&mode=warroom&run=${encodeURIComponent(runId)}`}>Open Cyber Lab</Link></Button>}
              <Button asChild size="sm" variant="ghost" className="w-full text-slate-300 hover:bg-white/10 hover:text-white"><Link href="/live">Advanced Live Workspace</Link></Button>
            </div>
          </details>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-slate-950/80 p-1 text-slate-100">
          <div className="flex items-center gap-2 px-3 pt-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-300">
            <Activity className="h-3.5 w-3.5" /> Environment readiness
          </div>
          <OperationRunStrip runId={runId} compact />
        </div>

        <details className="group overflow-hidden rounded-xl border border-red-500/20 bg-slate-950 text-slate-100" open>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold text-white">
            <Bot className="h-4 w-4 text-red-300" />
            <span className="flex-1">AI mission instructor</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform group-open:rotate-180" />
          </summary>
          <OperationAiInstructor embedded runId={runId} operationSlug={operation.slug} operationLabel={operation.codename} operationMode="warroom" objectives={operation.objectives} nodes={run?.nodes || []} selectedNode={aiNode} />
        </details>
      </aside>
    </div>
  );
}
