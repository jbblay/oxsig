'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  BookOpenCheck,
  Brain,
  Check,
  ChevronRight,
  Code2,
  Copy,
  FlaskConical,
  LibraryBig,
  ListChecks,
  Loader2,
  MessageCircle,
  Network,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  SquareTerminal,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createVaultItem,
  deleteVaultItem,
  listVaultItems,
  updateVaultItem,
} from '@/lib/vault/api';
import { optimisticTogglePinned, replaceVaultItem } from '@/lib/vault/optimistic';
import {
  VAULT_KIND_LABELS,
  VAULT_KINDS,
  type VaultItem,
  type VaultKind,
} from '@/lib/vault/types';

const KIND_ICONS: Record<VaultKind, React.ComponentType<{ className?: string }>> = {
  command: SquareTerminal,
  procedure: ListChecks,
  cheat_sheet: BookOpenCheck,
  script: Code2,
  concept: Brain,
  playbook: LibraryBig,
};

const BODY_LABELS: Record<VaultKind, string> = {
  command: 'Command and notes',
  procedure: 'Procedure',
  cheat_sheet: 'Reference content',
  script: 'Script and usage notes',
  concept: 'Concept',
  playbook: 'Playbook content',
};

const BODY_PLACEHOLDERS: Record<VaultKind, string> = {
  command: 'nmap -sS -sV -p- 10.0.0.5\n\nNotes…',
  procedure: '1. Identify target and scope\n2. Run discovery\n3. Enumerate services\n4. Record findings',
  cheat_sheet: 'Discovery\n  nmap -sn 10.0.0.0/24\n\nService scan\n  nmap -sV -p 22,80,443 10.0.0.5',
  script: '#!/usr/bin/env bash\n\n# Script…',
  concept: 'Concept, example, and key notes…',
  playbook: 'Goal\n\nDiscover\n\nEnumerate\n\nValidate',
};

type EditorState = {
  kind: VaultKind;
  title: string;
  summary: string;
  body: string;
  language: string;
  tags: string;
};

function blankEditor(kind: VaultKind = 'command'): EditorState {
  return { kind, title: '', summary: '', body: '', language: '', tags: '' };
}

function itemEditor(item: VaultItem): EditorState {
  return {
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    body: item.body,
    language: item.language || '',
    tags: item.tags.join(', '),
  };
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 12);
}

function relativeDate(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function firstUsefulLine(item: VaultItem) {
  return item.body.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
}

export default function VaultPage() {
  const router = useRouter();
  const [items, setItems] = React.useState<VaultItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [kindFilter, setKindFilter] = React.useState<'all' | VaultKind>('all');
  const [pinnedOnly, setPinnedOnly] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editor, setEditor] = React.useState<EditorState>(() => blankEditor());
  const [baselineEditor, setBaselineEditor] = React.useState<EditorState>(() => blankEditor());

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setItems(await listVaultItems());
    } catch (error) {
      console.error('Failed to load Vault:', error);
      setLoadError(error instanceof Error ? error.message : 'Vault could not be loaded');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const active = React.useMemo(
    () => items.find((item) => item.id === activeId) || null,
    [activeId, items]
  );

  const dirty = React.useMemo(
    () => JSON.stringify(editor) !== JSON.stringify(baselineEditor),
    [baselineEditor, editor]
  );

  React.useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [dirty]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (pinnedOnly && !item.pinned) return false;
      if (!needle) return true;
      return [item.title, item.summary, item.body, item.tags.join(' '), VAULT_KIND_LABELS[item.kind]]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [items, kindFilter, pinnedOnly, query]);

  function canDiscardChanges() {
    return !dirty || window.confirm('Discard your unsaved Vault changes?');
  }

  function selectItem(item: VaultItem) {
    if (!creating && activeId === item.id) return;
    if (!canDiscardChanges()) return;
    const next = itemEditor(item);
    setCreating(false);
    setActiveId(item.id);
    setEditor(next);
    setBaselineEditor(next);
  }

  function startCreate(kind: VaultKind = 'command') {
    if (!canDiscardChanges()) return;
    const next = blankEditor(kind);
    setActiveId(null);
    setCreating(true);
    setEditor(next);
    setBaselineEditor(next);
  }

  async function createItem() {
    if (!editor.title.trim()) {
      toast.error('Add a title.');
      return;
    }
    setSaving(true);
    try {
      const created = await createVaultItem({
        kind: editor.kind,
        title: editor.title.trim(),
        summary: editor.summary.trim(),
        body: editor.body,
        language: editor.language.trim() || null,
        tags: parseTags(editor.tags),
        sourceType: 'manual',
      });
      const next = itemEditor(created);
      setItems((current) => [created, ...current]);
      setCreating(false);
      setActiveId(created.id);
      setEditor(next);
      setBaselineEditor(next);
      toast.success('Saved to Vault.');
    } catch (error) {
      console.error('Failed to create Vault item:', error);
      toast.error(error instanceof Error ? error.message : 'Could not create Vault item');
    } finally {
      setSaving(false);
    }
  }

  async function saveActive() {
    if (!active || !editor.title.trim()) return;
    setSaving(true);
    try {
      const updated = await updateVaultItem(active.id, {
        kind: editor.kind,
        title: editor.title.trim(),
        summary: editor.summary.trim(),
        body: editor.body,
        language: editor.language.trim() || null,
        tags: parseTags(editor.tags),
      });
      const next = itemEditor(updated);
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditor(next);
      setBaselineEditor(next);
      toast.success('Saved.');
    } catch (error) {
      console.error('Failed to update Vault item:', error);
      toast.error(error instanceof Error ? error.message : 'Could not update Vault item');
    } finally {
      setSaving(false);
    }
  }

  async function togglePin(item: VaultItem) {
    const previous = item;
    const optimistic = optimisticTogglePinned(item);
    setSaving(true);
    setItems((current) => replaceVaultItem(current, optimistic));
    try {
      const updated = await updateVaultItem(item.id, { pinned: optimistic.pinned });
      setItems((current) => replaceVaultItem(current, updated));
    } catch (error) {
      setItems((current) => replaceVaultItem(current, previous));
      toast.error(error instanceof Error ? error.message : 'Could not update pin');
    } finally {
      setSaving(false);
    }
  }

  async function archiveActive() {
    if (!active) return;
    setSaving(true);
    try {
      await updateVaultItem(active.id, { archived: true });
      const next = blankEditor();
      setItems((current) => current.filter((item) => item.id !== active.id));
      setActiveId(null);
      setCreating(false);
      setEditor(next);
      setBaselineEditor(next);
      toast.success('Archived.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not archive Vault item');
    } finally {
      setSaving(false);
    }
  }

  async function removeActive() {
    if (!active || !window.confirm(`Permanently delete “${active.title}” from your Vault?`)) return;
    setSaving(true);
    try {
      await deleteVaultItem(active.id);
      const next = blankEditor();
      setItems((current) => current.filter((item) => item.id !== active.id));
      setActiveId(null);
      setCreating(false);
      setEditor(next);
      setBaselineEditor(next);
      toast.success('Deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete Vault item');
    } finally {
      setSaving(false);
    }
  }

  function handoff(item: VaultItem, destination: 'lab' | 'board' | 'collaboration') {
    if (dirty) {
      toast.error('Save or discard changes first.');
      return;
    }
    const payload = {
      version: 1,
      itemId: item.id,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      body: item.body,
      language: item.language,
      tags: item.tags,
      destination,
      createdAt: Date.now(),
    };
    try {
      window.localStorage.setItem('oxsig:vault-handoff', JSON.stringify(payload));
    } catch {
      // Navigation remains available when browser storage is unavailable.
    }

    if (destination === 'lab') {
      if (item.kind === 'command' || item.kind === 'script') {
        void navigator.clipboard?.writeText(item.body).then(
          () => toast.success('Copied.'),
          () => undefined
        );
      }
      router.push(`/labs?vault=${encodeURIComponent(item.id)}`);
      return;
    }
    if (destination === 'board') {
      router.push(`/collab/storyboards?vault=${encodeURIComponent(item.id)}`);
      return;
    }
    router.push(`/collab?vault=${encodeURIComponent(item.id)}`);
  }

  async function copyBody(item: VaultItem) {
    try {
      await navigator.clipboard.writeText(item.body || item.summary || item.title);
      toast.success('Copied.');
    } catch {
      toast.error('Copy failed.');
    }
  }

  function cancelEditor() {
    if (creating) {
      const next = blankEditor();
      setCreating(false);
      setActiveId(null);
      setEditor(next);
      setBaselineEditor(next);
      return;
    }
    if (active) {
      const next = itemEditor(active);
      setEditor(next);
      setBaselineEditor(next);
    }
  }

  const closeEditor = () => {
    if (!canDiscardChanges()) return;
    const next = blankEditor();
    setCreating(false);
    setActiveId(null);
    setEditor(next);
    setBaselineEditor(next);
  };

  const editorVisible = creating || !!active;
  const activeKind = editor.kind;
  const ActiveKindIcon = KIND_ICONS[activeKind];

  return (
    <div className="min-h-0 space-y-3">
      <div className="flex flex-col gap-2 rounded-lg border bg-card/70 p-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Vault" className="pl-9" aria-label="Search Vault" />
        </div>
        <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as 'all' | VaultKind)} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="Filter Vault by type">
          <option value="all">All items</option>
          {VAULT_KINDS.map((kind) => <option key={kind} value={kind}>{VAULT_KIND_LABELS[kind]}</option>)}
        </select>
        <Button size="sm" variant={pinnedOnly ? 'secondary' : 'outline'} onClick={() => setPinnedOnly((value) => !value)}>
          <Pin className="h-4 w-4" /> {pinnedOnly ? 'Pinned only' : 'Pinned'}
        </Button>
        <Button size="sm" onClick={() => startCreate('command')}><Plus className="h-4 w-4" /> New item</Button>
      </div>

      <div className={editorVisible ? 'grid min-h-0 gap-3 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]' : 'min-h-0'}>
        <div className={editorVisible ? 'hidden min-h-0 lg:block' : 'min-h-0'}>
          {loading ? (
            <div className="flex min-h-64 items-center justify-center rounded-lg border text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Vault…</div>
          ) : loadError ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-destructive/30 p-6 text-center">
              <LibraryBig className="h-8 w-8 text-muted-foreground/50" />
              <h2 className="mt-3 font-semibold">Could not load Vault</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">{loadError}</p>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Retry</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Brain className="h-5 w-5" /></div>
              <h2 className="text-sm font-semibold">{items.length === 0 ? 'No items yet' : 'No matches'}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{items.length === 0 ? 'Use New item when you are ready to add knowledge.' : 'Try a different search or filter.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => {
                const Icon = KIND_ICONS[item.kind];
                const snippet = firstUsefulLine(item);
                const selected = activeId === item.id;
                return (
                  <button key={item.id} type="button" aria-pressed={selected} onClick={() => selectItem(item)} className={`group w-full rounded-lg border p-3 text-left transition-colors ${selected ? 'border-primary/50 bg-primary/5' : 'bg-card hover:bg-muted/30'}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary"><Icon className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-normal">{VAULT_KIND_LABELS[item.kind]}</Badge>
                          {item.pinned && <Pin className="h-3 w-3 text-primary" />}
                          <span className="ml-auto text-[10px] text-muted-foreground">{relativeDate(item.updatedAt)}</span>
                        </div>
                        <h3 className="mt-1.5 truncate text-sm font-semibold">{item.title}</h3>
                        {item.summary && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</p>}
                        {snippet && <div className="mt-2 truncate rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{snippet}</div>}
                        {item.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{item.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">#{tag}</span>)}</div>}
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {editorVisible && (
          <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
            <Button type="button" size="sm" variant="ghost" className="mb-2 lg:hidden" onClick={closeEditor}>Back</Button>
            <Card className="overflow-hidden shadow-sm">
              <CardHeader className="border-b bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ActiveKindIcon className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><CardTitle className="truncate text-lg">{creating ? 'New item' : active?.title}</CardTitle>{dirty && <Badge variant="outline" className="text-[9px]">Unsaved</Badge>}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!creating && active && <Button size="icon" variant="ghost" disabled={saving} onClick={() => void togglePin(active)} title={active.pinned ? 'Unpin' : 'Pin'} aria-label={active.pinned ? 'Unpin Vault item' : 'Pin Vault item'}>{active.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</Button>}
                    <Button size="sm" variant="ghost" onClick={closeEditor} disabled={saving}>Close</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-medium">Type<select value={editor.kind} onChange={(event) => setEditor((current) => ({ ...current, kind: event.target.value as VaultKind }))} className="h-9 w-full rounded-md border bg-background px-3 text-sm" disabled={saving}>{VAULT_KINDS.map((kind) => <option key={kind} value={kind}>{VAULT_KIND_LABELS[kind]}</option>)}</select></label>
                  <label className="space-y-1.5 text-xs font-medium">Environment<Input value={editor.language} onChange={(event) => setEditor((current) => ({ ...current, language: event.target.value }))} placeholder="bash, Python, Linux…" maxLength={64} disabled={saving} /></label>
                </div>
                <label className="block space-y-1.5 text-xs font-medium">Title<Input value={editor.title} onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))} placeholder="Nmap service enumeration" maxLength={160} disabled={saving} /></label>
                <label className="block space-y-1.5 text-xs font-medium">Summary<Textarea value={editor.summary} onChange={(event) => setEditor((current) => ({ ...current, summary: event.target.value }))} placeholder="Optional summary" className="min-h-[76px]" maxLength={500} disabled={saving} /></label>
                <label className="block space-y-1.5 text-xs font-medium">{BODY_LABELS[editor.kind]}<Textarea value={editor.body} onChange={(event) => setEditor((current) => ({ ...current, body: event.target.value }))} placeholder={BODY_PLACEHOLDERS[editor.kind]} className="min-h-[260px] font-mono text-xs leading-5" maxLength={100000} disabled={saving} /></label>
                <label className="block space-y-1.5 text-xs font-medium">Tags<Input value={editor.tags} onChange={(event) => setEditor((current) => ({ ...current, tags: event.target.value }))} placeholder="nmap, enumeration, networking" disabled={saving} /></label>

                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {creating ? <Button onClick={() => void createItem()} disabled={saving || !editor.title.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</Button> : <Button onClick={() => void saveActive()} disabled={saving || !editor.title.trim() || !dirty}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</Button>}
                  <Button variant="outline" onClick={cancelEditor} disabled={saving}>{dirty ? 'Discard' : 'Reset'}</Button>
                </div>

                {!creating && active && (
                  <div className="space-y-3 border-t pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Actions</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button variant="outline" className="justify-start" onClick={() => handoff(active, 'lab')}><FlaskConical className="h-4 w-4" /> Open in Cyber Lab</Button>
                      <Button variant="outline" className="justify-start" onClick={() => handoff(active, 'board')}><Network className="h-4 w-4" /> Open on Board</Button>
                      <Button variant="outline" className="justify-start" onClick={() => handoff(active, 'collaboration')}><MessageCircle className="h-4 w-4" /> Discuss</Button>
                      <Button variant="outline" className="justify-start" onClick={() => void copyBody(active)}><Copy className="h-4 w-4" /> Copy</Button>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void archiveActive()} disabled={saving}><Archive className="h-4 w-4" /> Archive</Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void removeActive()} disabled={saving}><Trash2 className="h-4 w-4" /> Delete</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}