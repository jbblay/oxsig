'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ExternalLink,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  MousePointer2,
  Radio,
  RefreshCw,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCsrfToken } from '@/lib/security/csrf-client';
import {
  createStoryboardComment,
  deleteStoryboardComment,
  listStoryboardComments,
  updateStoryboardComment,
} from '@/lib/storyboards/api';
import type {
  StoryboardComment,
  StoryboardPermission,
  StoryboardPoint,
} from '@/lib/storyboards/types';
import { useStoryboardRealtime } from '@/lib/storyboards/use-realtime';

type ActiveBoard = {
  id: string;
  title: string;
  permission: StoryboardPermission;
  version: number;
  ownerId: string;
  ownerName: string;
};

type Profile = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
};

type LiveWorkspaceTarget = {
  id: string;
  name: string;
  capabilities?: { manageResources?: boolean };
};

type CollaborationTarget = {
  id: string;
  name: string;
};

type OverlayGeometry = {
  host: HTMLElement;
  left: number;
  top: number;
  width: number;
  height: number;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function messageData(message: { data?: unknown }) {
  return message.data && typeof message.data === 'object'
    ? message.data as Record<string, unknown>
    : {};
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

export default function BoardLiveReview() {
  const [activeBoard, setActiveBoard] = React.useState<ActiveBoard | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [comments, setComments] = React.useState<StoryboardComment[]>([]);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [commentMode, setCommentMode] = React.useState(false);
  const [pendingPoint, setPendingPoint] = React.useState<StoryboardPoint | null>(null);
  const [commentBody, setCommentBody] = React.useState('');
  const [commentBusy, setCommentBusy] = React.useState(false);
  const [selectedCommentId, setSelectedCommentId] = React.useState<string | null>(null);
  const [remoteUpdate, setRemoteUpdate] = React.useState<number | null>(null);
  const [boardDeleted, setBoardDeleted] = React.useState(false);
  const [canvas, setCanvas] = React.useState<HTMLCanvasElement | null>(null);
  const [overlayGeometry, setOverlayGeometry] = React.useState<OverlayGeometry | null>(null);
  const [handoffOpen, setHandoffOpen] = React.useState(false);
  const [handoffLoading, setHandoffLoading] = React.useState(false);
  const [liveTargets, setLiveTargets] = React.useState<LiveWorkspaceTarget[]>([]);
  const [collaborationTargets, setCollaborationTargets] = React.useState<CollaborationTarget[]>([]);
  const [selectedLiveId, setSelectedLiveId] = React.useState('');
  const [selectedCollaborationId, setSelectedCollaborationId] = React.useState('');

  React.useEffect(() => {
    const onActiveBoard = (event: Event) => {
      const detail = (event as CustomEvent<ActiveBoard | null>).detail;
      setActiveBoard(detail || null);
      setComments([]);
      setSelectedCommentId(null);
      setRemoteUpdate(null);
      setBoardDeleted(false);
      setCommentMode(false);
      setPendingPoint(null);
    };
    window.addEventListener('oxsig:board:active', onActiveBoard as EventListener);
    return () => window.removeEventListener('oxsig:board:active', onActiveBoard as EventListener);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void fetch('/api/users/me', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => {
        if (cancelled || !body?.user?.id) return;
        setProfile({
          id: body.user.id,
          displayName: body.user.displayName || body.user.email || 'OXSIG user',
          avatarUrl: body.user.avatarUrl || null,
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const loadComments = React.useCallback(async () => {
    if (!activeBoard) {
      setComments([]);
      return;
    }
    try {
      setComments(await listStoryboardComments(activeBoard.id));
    } catch (error) {
      console.error('Failed to load Board review comments:', error);
    }
  }, [activeBoard]);

  React.useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const realtimeProfile = React.useMemo(() => {
    if (!activeBoard || !profile) return null;
    return {
      userId: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || null,
      permission: activeBoard.permission,
    };
  }, [activeBoard, profile]);

  const realtime = useStoryboardRealtime(
    activeBoard?.id || null,
    realtimeProfile,
    {
      onBoardChanged: (message) => {
        const data = messageData(message);
        const version = Number(data.version);
        const actorId = typeof data.actorId === 'string' ? data.actorId : null;
        if (!Number.isFinite(version)) return;
        if (actorId && profile?.id && actorId === profile.id) {
          setActiveBoard((current) => current ? { ...current, version: Math.max(current.version, version) } : current);
          return;
        }
        if (activeBoard && version > activeBoard.version) setRemoteUpdate(version);
      },
      onBoardDeleted: () => {
        setBoardDeleted(true);
        setPanelOpen(true);
      },
      onAccessChanged: () => {
        setRemoteUpdate((current) => current || activeBoard?.version || 1);
      },
      onCommentsChanged: () => void loadComments(),
    }
  );

  React.useEffect(() => {
    if (!activeBoard) {
      setCanvas(null);
      return;
    }
    const findCanvas = () => {
      const next = document.querySelector<HTMLCanvasElement>('canvas[aria-label="Storyboard drawing canvas"]');
      if (next) setCanvas(next);
    };
    findCanvas();
    const observer = new MutationObserver(findCanvas);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [activeBoard]);

  React.useEffect(() => {
    if (!canvas) {
      setOverlayGeometry(null);
      return;
    }
    const host = canvas.parentElement;
    if (!host) return;
    const previousPosition = host.style.position;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

    const updateGeometry = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      setOverlayGeometry({
        host,
        left: canvasRect.left - hostRect.left + host.scrollLeft,
        top: canvasRect.top - hostRect.top + host.scrollTop,
        width: canvasRect.width,
        height: canvasRect.height,
      });
    };
    updateGeometry();
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(canvas);
    observer.observe(host);
    host.addEventListener('scroll', updateGeometry, { passive: true });
    window.addEventListener('resize', updateGeometry);
    return () => {
      observer.disconnect();
      host.removeEventListener('scroll', updateGeometry);
      window.removeEventListener('resize', updateGeometry);
      host.style.position = previousPosition;
    };
  }, [canvas]);

  React.useEffect(() => {
    if (!canvas || !activeBoard) return;
    const normalizedPoint = (event: PointerEvent): StoryboardPoint | null => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return null;
      return { x, y };
    };
    const onPointerMove = (event: PointerEvent) => {
      const point = normalizedPoint(event);
      if (point) realtime.publishCursor(point.x, point.y);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!commentMode) return;
      const point = normalizedPoint(event);
      if (!point) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPendingPoint(point);
      setCommentBody('');
      setCommentMode(false);
      setPanelOpen(true);
    };
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [activeBoard, canvas, commentMode, realtime]);

  const submitComment = async () => {
    if (!activeBoard || !pendingPoint || !commentBody.trim()) return;
    setCommentBusy(true);
    try {
      const created = await createStoryboardComment(activeBoard.id, pendingPoint, commentBody.trim());
      setComments((current) => [...current, created]);
      setSelectedCommentId(created.id);
      setPendingPoint(null);
      setCommentBody('');
      toast.success('Review comment pinned to the Board.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Board comment could not be created.');
    } finally {
      setCommentBusy(false);
    }
  };

  const toggleResolved = async (comment: StoryboardComment) => {
    if (!activeBoard) return;
    setCommentBusy(true);
    try {
      const updated = await updateStoryboardComment(activeBoard.id, comment.id, { resolved: !comment.resolvedAt });
      setComments((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Comment status could not be changed.');
    } finally {
      setCommentBusy(false);
    }
  };

  const removeComment = async (comment: StoryboardComment) => {
    if (!activeBoard) return;
    setCommentBusy(true);
    try {
      await deleteStoryboardComment(activeBoard.id, comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
      if (selectedCommentId === comment.id) setSelectedCommentId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Comment could not be deleted.');
    } finally {
      setCommentBusy(false);
    }
  };

  const loadHandoffTargets = React.useCallback(async () => {
    setHandoffLoading(true);
    try {
      const [liveResponse, collaborationResponse] = await Promise.all([
        fetch('/api/live-workspaces', { cache: 'no-store' }),
        fetch('/api/collaborations', { cache: 'no-store' }),
      ]);
      const [liveBody, collaborationBody] = await Promise.all([
        liveResponse.ok ? liveResponse.json() : Promise.resolve(null),
        collaborationResponse.ok ? collaborationResponse.json() : Promise.resolve(null),
      ]);
      const workspaces = Array.isArray(liveBody?.workspaces)
        ? liveBody.workspaces.filter((workspace: LiveWorkspaceTarget) => workspace.capabilities?.manageResources)
        : [];
      const collaborations = Array.isArray(collaborationBody?.collaborations)
        ? collaborationBody.collaborations.map((item: CollaborationTarget) => ({ id: item.id, name: item.name }))
        : [];
      setLiveTargets(workspaces);
      setCollaborationTargets(collaborations);
      setSelectedLiveId((current) => current || workspaces[0]?.id || '');
      setSelectedCollaborationId((current) => current || collaborations[0]?.id || '');
    } catch (error) {
      console.error('Board handoff target load failed:', error);
      toast.error('Handoff destinations could not be loaded.');
    } finally {
      setHandoffLoading(false);
    }
  }, []);

  const openHandoffs = () => {
    setHandoffOpen(true);
    void loadHandoffTargets();
  };

  const attachToLiveWorkspace = async () => {
    if (!activeBoard || !selectedLiveId) return;
    setHandoffLoading(true);
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${selectedLiveId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ resourceType: 'storyboard', resourceId: activeBoard.id }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Board could not be attached to Live Workspace.');
      }
      toast.success('Board attached to Live Workspace.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Board handoff failed.');
    } finally {
      setHandoffLoading(false);
    }
  };

  const postToCollaboration = async () => {
    if (!activeBoard || !selectedCollaborationId) return;
    setHandoffLoading(true);
    try {
      const token = await getCsrfToken();
      const href = `/collab/storyboards?session=${encodeURIComponent(activeBoard.id)}`;
      const response = await fetch(`/api/collaborations/${selectedCollaborationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({
          text: `Board: ${activeBoard.title}`,
          type: 'resource',
          metadata: {
            resourceType: 'storyboard',
            resourceId: activeBoard.id,
            title: activeBoard.title,
            href,
          },
          clientMessageId: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Board could not be posted to Collaboration.');
      }
      toast.success('Board posted to Collaboration.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Collaboration handoff failed.');
    } finally {
      setHandoffLoading(false);
    }
  };

  if (!activeBoard) return null;

  const unresolvedCount = comments.filter((comment) => !comment.resolvedAt).length;
  const selectedComment = comments.find((comment) => comment.id === selectedCommentId) || null;
  const canModerate = activeBoard.permission === 'owner' || activeBoard.permission === 'editor';

  const overlay = overlayGeometry ? createPortal(
    <div
      className="pointer-events-none absolute z-30"
      style={{
        left: overlayGeometry.left,
        top: overlayGeometry.top,
        width: overlayGeometry.width,
        height: overlayGeometry.height,
      }}
      aria-hidden={false}
    >
      {realtime.remoteCursors.map((cursor) => (
        <div
          key={cursor.userId}
          className="absolute -translate-x-1 -translate-y-1"
          style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
        >
          <MousePointer2 className="h-5 w-5 fill-primary text-primary drop-shadow" />
          <span className="ml-3 inline-flex max-w-32 truncate rounded bg-background/95 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow">
            {cursor.displayName}
          </span>
        </div>
      ))}
      {comments.map((comment, index) => (
        <button
          key={comment.id}
          type="button"
          className={`pointer-events-auto absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[10px] font-semibold shadow-sm ${comment.resolvedAt ? 'bg-muted text-muted-foreground opacity-60' : 'bg-primary text-primary-foreground'}`}
          style={{ left: `${comment.point.x * 100}%`, top: `${comment.point.y * 100}%` }}
          onClick={() => {
            setSelectedCommentId(comment.id);
            setPanelOpen(true);
          }}
          aria-label={`Review comment ${index + 1} from ${comment.authorName}`}
        >
          {index + 1}
        </button>
      ))}
    </div>,
    overlayGeometry.host
  ) : null;

  return (
    <>
      <div className="oxsig-workspace-rail mb-2" data-workspace="boards" aria-label="Board live review">
        <div className="oxsig-rail-title">
          <Radio className="h-4 w-4" />
          <span>Live review</span>
        </div>
        <div className="oxsig-rail-badges">
          <span><Users className="h-3 w-3" /> {realtime.onlineCount} online</span>
          <span><MessageCircle className="h-3 w-3" /> {unresolvedCount} open</span>
          <span>{realtime.state === 'connected' ? 'Realtime' : realtime.state === 'connecting' ? 'Connecting' : 'Fallback'}</span>
        </div>
        <div className="oxsig-rail-actions">
          <Button
            size="sm"
            variant={commentMode ? 'secondary' : 'ghost'}
            className="h-8 gap-1.5 px-2 text-xs"
            onClick={() => {
              setCommentMode((value) => !value);
              setPendingPoint(null);
              if (!commentMode) toast.info('Tap the Board where you want to pin a review comment.');
            }}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" /> Comment
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={() => setPanelOpen(true)}>
            <MessageCircle className="h-3.5 w-3.5" /> Review
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={openHandoffs}>
            <Send className="h-3.5 w-3.5" /> Handoff
          </Button>
          {remoteUpdate && (
            <Button size="sm" variant="secondary" className="h-8 gap-1.5 px-2 text-xs" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3.5 w-3.5" /> Reload v{remoteUpdate}
            </Button>
          )}
        </div>
      </div>

      {overlay}

      {panelOpen && (
        <aside className="fixed inset-x-3 bottom-3 top-20 z-[90] flex flex-col rounded-xl border bg-background/98 shadow-2xl backdrop-blur sm:left-auto sm:w-[390px]" aria-label="Board review panel">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{activeBoard.title}</p>
              <p className="text-xs text-muted-foreground">{realtime.onlineCount} online · {unresolvedCount} unresolved</p>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPanelOpen(false)} aria-label="Close Board review">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {boardDeleted && (
            <div className="m-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              This Board was deleted in another session. Reload to leave the stale view.
            </div>
          )}
          {remoteUpdate && !boardDeleted && (
            <div className="m-3 flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-xs">
              <span>A newer Board version is available.</span>
              <Button size="sm" variant="outline" className="h-7" onClick={() => window.location.reload()}>Reload</Button>
            </div>
          )}

          <div className="border-b px-3 py-2">
            <div className="flex -space-x-2 overflow-hidden">
              {realtime.people.slice(0, 8).map((person) => (
                <div key={person.userId} className="relative h-8 w-8 rounded-full border-2 border-background bg-muted" title={`${person.displayName} · ${person.permission}`}>
                  {person.avatarUrl ? (
                    <img src={person.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-[10px] font-semibold">{initials(person.displayName)}</span>
                  )}
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
                </div>
              ))}
              {realtime.people.length === 0 && <span className="text-xs text-muted-foreground">No other active reviewers.</span>}
            </div>
          </div>

          {pendingPoint && (
            <div className="space-y-2 border-b p-3">
              <p className="text-xs font-medium">New pinned comment</p>
              <textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder="Add review context, a question, or a decision…"
                rows={3}
                maxLength={2000}
                className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setPendingPoint(null); setCommentBody(''); }}>Cancel</Button>
                <Button size="sm" onClick={() => void submitComment()} disabled={commentBusy || !commentBody.trim()}>
                  {commentBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Pin comment
                </Button>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-3 oxisg-scrollbar">
            {comments.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No review comments yet. Use Comment, then tap the Board to pin one.
              </div>
            ) : (
              <div className="space-y-2">
                {comments.map((comment, index) => {
                  const canDelete = comment.authorId === profile?.id || activeBoard.permission === 'owner';
                  const canResolve = comment.authorId === profile?.id || canModerate;
                  return (
                    <div
                      key={comment.id}
                      className={`rounded-lg border p-3 ${selectedComment?.id === comment.id ? 'border-primary/60 bg-primary/5' : ''}`}
                      onMouseEnter={() => setSelectedCommentId(comment.id)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold">
                          {comment.authorAvatarUrl ? <img src={comment.authorAvatarUrl} alt="" className="h-full w-full object-cover" /> : initials(comment.authorName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium">{index + 1}. {comment.authorName}</span>
                            {comment.resolvedAt && <Badge variant="outline" className="h-5 text-[9px]">Resolved</Badge>}
                            <span className="text-[10px] text-muted-foreground">{formatTimestamp(comment.createdAt)}</span>
                          </div>
                          <p className={`mt-1 whitespace-pre-wrap text-sm ${comment.resolvedAt ? 'text-muted-foreground line-through decoration-muted-foreground/40' : ''}`}>{comment.body}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end gap-1">
                        {canResolve && (
                          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" disabled={commentBusy} onClick={() => void toggleResolved(comment)}>
                            <Check className="h-3 w-3" /> {comment.resolvedAt ? 'Reopen' : 'Resolve'}
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={commentBusy} onClick={() => void removeComment(comment)} aria-label={`Delete comment from ${comment.authorName}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      )}

      {handoffOpen && (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Board handoff">
          <div className="w-full max-w-md rounded-xl border bg-background p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Handoff Board</p>
                <p className="text-xs text-muted-foreground">Carry this Board into an active team surface.</p>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setHandoffOpen(false)} aria-label="Close handoff"><X className="h-4 w-4" /></Button>
            </div>

            {handoffLoading && liveTargets.length === 0 && collaborationTargets.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading destinations…</div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-xs font-medium">Live Workspace</p>
                  <select value={selectedLiveId} onChange={(event) => setSelectedLiveId(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm" disabled={!liveTargets.length}>
                    {liveTargets.length ? liveTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>) : <option value="">No workspace where you can manage resources</option>}
                  </select>
                  <Button className="w-full" size="sm" variant="outline" disabled={!selectedLiveId || handoffLoading} onClick={() => void attachToLiveWorkspace()}>
                    <ExternalLink className="h-4 w-4" /> Attach to Live Workspace
                  </Button>
                </div>

                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-xs font-medium">Collaboration</p>
                  <select value={selectedCollaborationId} onChange={(event) => setSelectedCollaborationId(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm" disabled={!collaborationTargets.length}>
                    {collaborationTargets.length ? collaborationTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>) : <option value="">No collaboration sessions available</option>}
                  </select>
                  <Button className="w-full" size="sm" variant="outline" disabled={!selectedCollaborationId || handoffLoading} onClick={() => void postToCollaboration()}>
                    <Send className="h-4 w-4" /> Post Board to Collaboration
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
