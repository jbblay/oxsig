'use client';

import * as React from 'react';
import {
  Bell,
  BellOff,
  Bot,
  Check,
  ChevronDown,
  Command,
  ListTodo,
  Loader2,
  MessageSquareQuote,
  Pin,
  Search,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Session = { id: string; name: string };
type SearchResult = { id: string; text: string; senderName: string; createdAt: string; pinned?: boolean };
type PinResult = { id: string; text: string; senderName: string; pinnedAt: string };
type ActionItem = { id: string; messageId?: string | null; title: string; status: 'open' | 'done'; createdByName?: string };
type NotificationMode = 'all' | 'mentions' | 'muted';
type Panel = 'search' | 'pins' | 'tasks' | 'ai' | 'notifications';

function openAi(prompt: string) {
  window.dispatchEvent(new CustomEvent('oxsig:ai-helper:open', { detail: { prompt } }));
}

function focusMessage(messageId: string) {
  window.dispatchEvent(new CustomEvent('oxsig:collaboration:focus-message', { detail: { messageId } }));
}

function inferVisibleSessionName() {
  return document.querySelector('.oxsig-surface-collab main header h1')?.textContent?.trim() || '';
}

export default function CollaborationCommandCenter() {
  const [open, setOpen] = React.useState(false);
  const [panel, setPanel] = React.useState<Panel>('search');
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [pins, setPins] = React.useState<PinResult[]>([]);
  const [tasks, setTasks] = React.useState<ActionItem[]>([]);
  const [notificationMode, setNotificationMode] = React.useState<NotificationMode>('all');
  const [loading, setLoading] = React.useState(false);

  const activeSession = sessions.find((session) => session.id === activeId) || null;

  React.useEffect(() => {
    let cancelled = false;
    const reconcile = async () => {
      try {
        const response = await fetch('/api/collaborations', { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;
        const next = (body.collaborations || []).map((item: Record<string, unknown>) => ({ id: String(item.id), name: String(item.name || 'Session') })) as Session[];
        setSessions(next);
        const visibleName = inferVisibleSessionName();
        const visible = next.find((session) => session.name === visibleName);
        setActiveId((current) => visible?.id || (current && next.some((session) => session.id === current) ? current : next[0]?.id || null));
      } catch {
        // Core workspace remains authoritative if this optional control cannot reconcile.
      }
    };

    void reconcile();
    const onActive = (event: Event) => {
      const id = (event as CustomEvent<{ collaborationId?: string | null }>).detail?.collaborationId;
      if (typeof id === 'string' && id) setActiveId(id);
    };
    window.addEventListener('oxsig:collaboration:active', onActive);

    const observer = new MutationObserver(() => {
      const name = inferVisibleSessionName();
      if (!name) return;
      setSessions((current) => {
        const match = current.find((session) => session.name === name);
        if (match) setActiveId(match.id);
        return current;
      });
    });
    const root = document.querySelector('.oxsig-surface-collab');
    if (root) observer.observe(root, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener('oxsig:collaboration:active', onActive);
    };
  }, []);

  const loadPanel = React.useCallback(async (nextPanel: Panel, id = activeId) => {
    if (!id) return;
    setLoading(true);
    try {
      if (nextPanel === 'pins') {
        const response = await fetch(`/api/collaborations/${id}/pins`, { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Could not load pins');
        setPins(body.pins || []);
      } else if (nextPanel === 'tasks') {
        const response = await fetch(`/api/collaborations/${id}/action-items`, { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Could not load action items');
        setTasks(body.items || []);
      } else if (nextPanel === 'notifications') {
        const response = await fetch(`/api/collaborations/${id}/notification-preference`, { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Could not load notification preference');
        setNotificationMode(body.mode || 'all');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load collaboration tools');
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  React.useEffect(() => {
    if (open && activeId) void loadPanel(panel, activeId);
  }, [activeId, loadPanel, open, panel]);

  React.useEffect(() => {
    if (!open || panel !== 'search' || !activeId) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/collaborations/${activeId}/search?q=${encodeURIComponent(trimmed)}`, { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Search failed');
        setResults(body.results || []);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [activeId, open, panel, query]);

  const recentContext = async () => {
    if (!activeId) throw new Error('Choose a collaboration session first');
    const response = await fetch(`/api/collaborations/${activeId}/messages?limit=80`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not load collaboration context');
    return (body.messages || [])
      .filter((message: Record<string, unknown>) => !message.deleted && typeof message.text === 'string' && message.text.trim())
      .slice(-40)
      .map((message: Record<string, unknown>) => `${message.senderName || 'Member'}: ${String(message.text).trim()}`)
      .join('\n')
      .slice(0, 9000);
  };

  const runIntelligence = async (mode: 'summary' | 'commands' | 'tasks' | 'lab' | 'board') => {
    setLoading(true);
    try {
      const context = await recentContext();
      if (!context) throw new Error('This conversation does not have enough text context yet');
      const prompts = {
        summary: 'Summarize the concrete decisions, unresolved questions, owners, and next steps in this collaboration. Do not invent anything.',
        commands: 'Extract every command, code snippet, endpoint, hostname, path, configuration value, and verification step from this collaboration. Group them into a concise reusable technical reference.',
        tasks: 'Convert this collaboration into an actionable task list. Separate confirmed tasks from suggestions and preserve any named owner or deadline exactly as stated.',
        lab: 'Turn this collaboration into a hands-on Oxsig Cyber Lab plan with objective, prerequisites, safe steps, verification checks, and success criteria. Use only the supplied context.',
        board: 'Turn this collaboration into a clean Board outline with sections for context, decisions, evidence, commands, open questions, and next actions.',
      } as const;
      openAi(`${prompts[mode]}\n\nCollaboration: ${activeSession?.name || 'Current session'}\n\n${context}`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare AI workflow');
    } finally {
      setLoading(false);
    }
  };

  const updateNotification = async (mode: NotificationMode) => {
    if (!activeId) return;
    setLoading(true);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/collaborations/${activeId}/notification-preference`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ mode }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not update notifications');
      setNotificationMode(body.mode as NotificationMode);
      toast.success(mode === 'muted' ? 'Conversation muted' : mode === 'mentions' ? 'Mentions only' : 'All notifications enabled');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update notifications');
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (item: ActionItem) => {
    if (!activeId) return;
    const next = item.status === 'done' ? 'open' : 'done';
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/collaborations/${activeId}/action-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ status: next }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not update action item');
      setTasks((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, status: next } : candidate));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update action item');
    }
  };

  const choosePanel = (next: Panel) => {
    setPanel(next);
    if (activeId) void loadPanel(next, activeId);
  };

  if (!sessions.length) return null;

  return (
    <div className="absolute bottom-[6.6rem] right-2.5 z-30 sm:bottom-[6.1rem] sm:right-3">
      {open && (
        <div className="mb-2 flex max-h-[min(34rem,70vh)] w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <Command className="h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">Collaboration tools</p>
              <p className="truncate text-[10px] text-muted-foreground">{activeSession?.name || 'Choose a session'}</p>
            </div>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close collaboration tools"><X className="h-3.5 w-3.5" /></Button>
          </div>

          {sessions.length > 1 && (
            <label className="relative border-b px-3 py-2">
              <span className="sr-only">Tool session</span>
              <select value={activeId || ''} onChange={(event) => setActiveId(event.target.value)} className="h-8 w-full appearance-none rounded-md border bg-background px-2 pr-7 text-xs">
                {sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </label>
          )}

          <div className="flex gap-1 overflow-x-auto border-b p-1.5">
            {([
              ['search', Search, 'Search'],
              ['pins', Pin, 'Pins'],
              ['tasks', ListTodo, 'Tasks'],
              ['ai', Sparkles, 'AI'],
              ['notifications', Bell, 'Alerts'],
            ] as const).map(([value, Icon, label]) => (
              <Button key={value} type="button" size="sm" variant={panel === value ? 'secondary' : 'ghost'} className="h-7 shrink-0 px-2 text-[10px]" onClick={() => choosePanel(value)}><Icon className="mr-1 h-3 w-3" />{label}</Button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading && <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Updating…</div>}

            {panel === 'search' && (
              <div className="space-y-2">
                <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this conversation" className="h-9 pl-8 text-xs" autoFocus /></div>
                {query.trim().length < 2 ? <p className="py-6 text-center text-xs text-muted-foreground">Type at least two characters.</p> : results.length === 0 && !loading ? <p className="py-6 text-center text-xs text-muted-foreground">No matching messages.</p> : results.map((item) => (
                  <button key={item.id} type="button" onClick={() => { focusMessage(item.id); setOpen(false); }} className="block w-full rounded-lg border p-2.5 text-left hover:bg-muted/40">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="font-medium text-foreground">{item.senderName}</span>{item.pinned && <Pin className="h-3 w-3 text-primary" />}</div>
                    <p className="mt-1 line-clamp-3 text-xs leading-5">{item.text}</p>
                  </button>
                ))}
              </div>
            )}

            {panel === 'pins' && (
              <div className="space-y-2">
                {pins.length === 0 && !loading ? <p className="py-6 text-center text-xs text-muted-foreground">No pinned messages yet.</p> : pins.map((item) => (
                  <button key={item.id} type="button" onClick={() => { focusMessage(item.id); setOpen(false); }} className="block w-full rounded-lg border p-2.5 text-left hover:bg-muted/40"><div className="flex items-center gap-1 text-[10px] text-primary"><Pin className="h-3 w-3" />{item.senderName}</div><p className="mt-1 line-clamp-3 text-xs leading-5">{item.text}</p></button>
                ))}
              </div>
            )}

            {panel === 'tasks' && (
              <div className="space-y-2">
                {tasks.length === 0 && !loading ? <p className="py-6 text-center text-xs text-muted-foreground">Create an action item from any message’s ••• menu.</p> : tasks.map((item) => (
                  <button key={item.id} type="button" onClick={() => void toggleTask(item)} className="flex w-full items-start gap-2 rounded-lg border p-2.5 text-left hover:bg-muted/40"><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${item.status === 'done' ? 'bg-primary text-primary-foreground' : ''}`}>{item.status === 'done' && <Check className="h-3 w-3" />}</span><span className="min-w-0"><span className={`block text-xs ${item.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>{item.title}</span>{item.createdByName && <span className="mt-0.5 block text-[9px] text-muted-foreground">Created by {item.createdByName}</span>}</span></button>
                ))}
              </div>
            )}

            {panel === 'ai' && (
              <div className="grid gap-2">
                <button type="button" onClick={() => void runIntelligence('summary')} className="rounded-xl border p-3 text-left hover:bg-muted/40"><div className="flex items-center gap-2 text-xs font-semibold"><MessageSquareQuote className="h-4 w-4 text-primary" />Summarize decisions</div><p className="mt-1 text-[10px] text-muted-foreground">Decisions, owners, open questions, and next steps.</p></button>
                <button type="button" onClick={() => void runIntelligence('commands')} className="rounded-xl border p-3 text-left hover:bg-muted/40"><div className="flex items-center gap-2 text-xs font-semibold"><Command className="h-4 w-4 text-primary" />Extract commands</div><p className="mt-1 text-[10px] text-muted-foreground">Build a reusable technical reference from the chat.</p></button>
                <button type="button" onClick={() => void runIntelligence('tasks')} className="rounded-xl border p-3 text-left hover:bg-muted/40"><div className="flex items-center gap-2 text-xs font-semibold"><ListTodo className="h-4 w-4 text-primary" />Draft tasks</div><p className="mt-1 text-[10px] text-muted-foreground">Separate confirmed work from suggestions.</p></button>
                <button type="button" onClick={() => void runIntelligence('lab')} className="rounded-xl border p-3 text-left hover:bg-muted/40"><div className="flex items-center gap-2 text-xs font-semibold"><Bot className="h-4 w-4 text-primary" />Turn into Lab</div><p className="mt-1 text-[10px] text-muted-foreground">Create objective, safe steps, checks, and success criteria.</p></button>
                <button type="button" onClick={() => void runIntelligence('board')} className="rounded-xl border p-3 text-left hover:bg-muted/40"><div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="h-4 w-4 text-primary" />Turn into Board</div><p className="mt-1 text-[10px] text-muted-foreground">Organize context, evidence, decisions, and next actions.</p></button>
              </div>
            )}

            {panel === 'notifications' && (
              <div className="space-y-2">
                {([
                  ['all', Volume2, 'All messages', 'Receive normal collaboration notifications.'],
                  ['mentions', Bell, 'Mentions only', 'Only surface direct mentions and high-signal alerts.'],
                  ['muted', BellOff, 'Muted', 'Keep unread state without notification noise.'],
                ] as const).map(([mode, Icon, label, detail]) => (
                  <button key={mode} type="button" onClick={() => void updateNotification(mode)} className={`flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition hover:bg-muted/40 ${notificationMode === mode ? 'border-primary/45 bg-primary/5' : ''}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-xs font-semibold">{label}{notificationMode === mode && <Check className="h-3 w-3 text-primary" />}</span><span className="mt-1 block text-[10px] text-muted-foreground">{detail}</span></span></button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-md transition hover:scale-105" aria-label="Collaboration tools" title="Search, pins, tasks, AI and notifications"><Command className="h-4 w-4" /></button>
    </div>
  );
}