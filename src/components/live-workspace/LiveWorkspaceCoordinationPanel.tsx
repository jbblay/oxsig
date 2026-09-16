'use client';

import * as React from 'react';
import {
  Camera,
  CheckCircle2,
  Circle,
  Clock3,
  History,
  ListChecks,
  Loader2,
  Package,
  Plus,
  StickyNote,
  Swords,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { getCsrfToken } from '@/lib/security/csrf-client';

type SnapshotResource = {
  bindingId: string;
  type: string;
  resourceId: string;
  resourceOwnerId: string;
  ownerName: string;
  label: string;
  attachedAt: string;
};

type CoordinationItem = {
  id: string;
  kind: 'note' | 'checklist' | 'snapshot';
  content: string;
  metadata: { resources?: SnapshotResource[] };
  author: { id: string; displayName: string; avatarUrl: string | null };
  completedAt: string | null;
  completedBy: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
};

type ActivityEvent = {
  id: string;
  eventType: string;
  summary: string;
  metadata: Record<string, unknown>;
  actor: { id: string; displayName: string; avatarUrl: string | null } | null;
  createdAt: string;
};

type CoordinationPayload = {
  viewerId: string;
  canWrite: boolean;
  canManage: boolean;
  canHandoff: boolean;
  items: CoordinationItem[];
  activity: ActivityEvent[];
};

type Props = {
  workspaceId: string;
  refreshToken: number;
  className?: string;
};

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function eventTone(eventType: string) {
  if (eventType.startsWith('checklist.completed')) return 'text-emerald-500';
  if (eventType.startsWith('warroom')) return 'text-red-500';
  if (eventType.startsWith('resource') || eventType.startsWith('snapshot')) return 'text-cyan-500';
  return 'text-muted-foreground';
}

export default function LiveWorkspaceCoordinationPanel({ workspaceId, refreshToken, className = '' }: Props) {
  const [data, setData] = React.useState<CoordinationPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<'note' | 'checklist'>('checklist');
  const [draft, setDraft] = React.useState('');

  const load = React.useCallback(async () => {
    const response = await fetch(`/api/live-workspaces/${workspaceId}/coordination`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await apiError(response, 'Could not load workspace plan'));
    const body = await response.json() as CoordinationPayload;
    setData(body);
  }, [workspaceId]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Could not load workspace plan');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [load, refreshToken]);

  async function createItem() {
    if (!draft.trim()) return;
    setBusy('create');
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${workspaceId}/coordination`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ action: mode, content: draft.trim() }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not add workspace item'));
      setDraft('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add workspace item');
    } finally {
      setBusy(null);
    }
  }

  async function captureSnapshot() {
    setBusy('snapshot');
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${workspaceId}/coordination`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ action: 'snapshot' }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not capture resource snapshot'));
      await load();
      toast.success('Resource snapshot captured.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not capture resource snapshot');
    } finally {
      setBusy(null);
    }
  }

  async function toggleChecklist(item: CoordinationItem) {
    setBusy(`toggle:${item.id}`);
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${workspaceId}/coordination/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ completed: !item.completedAt }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not update checklist item'));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update checklist item');
    } finally {
      setBusy(null);
    }
  }

  async function deleteItem(item: CoordinationItem) {
    setBusy(`delete:${item.id}`);
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${workspaceId}/coordination/${item.id}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': token },
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not remove workspace item'));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove workspace item');
    } finally {
      setBusy(null);
    }
  }

  async function handoffToWarRoom() {
    setBusy('handoff');
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${workspaceId}/coordination`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ action: 'handoff' }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not prepare Cyber Room handoff'));
      const body = await response.json() as { href?: string };
      if (!body.href) throw new Error('Cyber Room handoff did not return a destination');
      window.location.assign(body.href);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare Cyber Room handoff');
      setBusy(null);
    }
  }

  const checklist = data?.items.filter((item) => item.kind === 'checklist') || [];
  const notes = data?.items.filter((item) => item.kind === 'note') || [];
  const snapshots = data?.items.filter((item) => item.kind === 'snapshot') || [];
  const completedCount = checklist.filter((item) => item.completedAt).length;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4" /> Plan</CardTitle>
            <CardDescription className="mt-1 text-xs">Shared checklist, notes, snapshots and workspace activity.</CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            {checklist.length > 0 && <Badge variant="secondary" className="text-[9px]">{completedCount}/{checklist.length} done</Badge>}
            {data?.canWrite && (
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Capture resource snapshot" aria-label="Capture resource snapshot" disabled={busy === 'snapshot'} onClick={() => void captureSnapshot()}>
                {busy === 'snapshot' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !data ? (
          <div className="flex min-h-36 items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading plan…</div>
        ) : !data ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Coordination is unavailable.</p>
        ) : (
          <>
            {data.canWrite && (
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-1">
                  <Button type="button" size="sm" variant={mode === 'checklist' ? 'secondary' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => setMode('checklist')}><ListChecks className="mr-1.5 h-3.5 w-3.5" /> Task</Button>
                  <Button type="button" size="sm" variant={mode === 'note' ? 'secondary' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => setMode('note')}><StickyNote className="mr-1.5 h-3.5 w-3.5" /> Note</Button>
                </div>
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
                  placeholder={mode === 'checklist' ? 'Add the next thing the team needs to do…' : 'Capture context for everyone…'}
                  className="min-h-16 resize-none text-sm"
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                      event.preventDefault();
                      void createItem();
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground">Ctrl/⌘ + Enter</span>
                  <Button size="sm" className="h-8" disabled={!draft.trim() || busy === 'create'} onClick={() => void createItem()}>
                    {busy === 'create' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {checklist.length === 0 && notes.length === 0 && snapshots.length === 0 && (
                <p className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">Nothing planned yet. Add a task or note to give the workspace shared context.</p>
              )}

              {checklist.map((item) => {
                const changing = busy === `toggle:${item.id}`;
                const canDelete = item.author.id === data.viewerId || data.canManage;
                return (
                  <div key={item.id} className="group flex items-start gap-2 rounded-xl border p-3">
                    <button type="button" className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50" disabled={!data.canWrite || changing} aria-label={item.completedAt ? 'Reopen checklist item' : 'Complete checklist item'} onClick={() => void toggleChecklist(item)}>
                      {changing ? <Loader2 className="h-4 w-4 animate-spin" /> : item.completedAt ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-5 ${item.completedAt ? 'text-muted-foreground line-through' : ''}`}>{item.content}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{item.author.displayName}{item.completedBy ? ` · completed by ${item.completedBy.displayName}` : ''}</p>
                    </div>
                    {canDelete && <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 opacity-60 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Remove checklist item" disabled={busy === `delete:${item.id}`} onClick={() => void deleteItem(item)}>{busy === `delete:${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</Button>}
                  </div>
                );
              })}

              {notes.map((item) => {
                const canDelete = item.author.id === data.viewerId || data.canManage;
                return (
                  <div key={item.id} className="group rounded-xl border p-3">
                    <div className="flex items-start gap-2">
                      <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <div className="min-w-0 flex-1"><p className="whitespace-pre-wrap text-sm leading-5">{item.content}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.author.displayName} · {timeLabel(item.createdAt)}</p></div>
                      {canDelete && <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 opacity-60 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Remove note" disabled={busy === `delete:${item.id}`} onClick={() => void deleteItem(item)}>{busy === `delete:${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</Button>}
                    </div>
                  </div>
                );
              })}

              {snapshots.slice(0, 3).map((item) => {
                const resources = item.metadata.resources || [];
                const canDelete = item.author.id === data.viewerId || data.canManage;
                return (
                  <div key={item.id} className="group rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-3">
                    <div className="flex items-start gap-2">
                      <Package className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{item.content}</p><Badge variant="outline" className="text-[9px]">{resources.length} resources</Badge></div>
                        {resources.length > 0 && <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{resources.slice(0, 4).map((resource) => resource.label).join(' · ')}{resources.length > 4 ? ` · +${resources.length - 4}` : ''}</p>}
                        <p className="mt-1 text-[10px] text-muted-foreground">{item.author.displayName} · {timeLabel(item.createdAt)}</p>
                      </div>
                      {canDelete && <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 opacity-60 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Remove snapshot" disabled={busy === `delete:${item.id}`} onClick={() => void deleteItem(item)}>{busy === `delete:${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</Button>}
                    </div>
                  </div>
                );
              })}
            </div>

            {data.canHandoff && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.035] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold"><Swords className="h-4 w-4 text-red-500" /> Cyber Room handoff</p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Carry this workspace, its people, and resources into a live team operation.</p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" disabled={busy === 'handoff'} onClick={() => void handoffToWarRoom()}>
                    {busy === 'handoff' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Swords className="h-3.5 w-3.5" />} Enter Cyber Room
                  </Button>
                </div>
              </div>
            )}

            <details className="group rounded-xl border">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold">
                <History className="h-3.5 w-3.5" /> Activity
                <Badge variant="secondary" className="ml-auto text-[9px]">{data.activity.length}</Badge>
              </summary>
              <div className="border-t px-3 py-2">
                {data.activity.length === 0 ? <p className="py-2 text-center text-[11px] text-muted-foreground">No shared activity yet.</p> : (
                  <div className="space-y-2">
                    {data.activity.slice(0, 12).map((event) => (
                      <div key={event.id} className="flex gap-2 text-[11px] leading-4">
                        <Clock3 className={`mt-0.5 h-3 w-3 shrink-0 ${eventTone(event.eventType)}`} />
                        <div className="min-w-0 flex-1"><p>{event.summary}</p><p className="text-[10px] text-muted-foreground">{event.actor?.displayName || 'System'} · {timeLabel(event.createdAt)}</p></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
