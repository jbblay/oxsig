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
  FileText,
  FlaskConical,
  LibraryBig,
  ListChecks,
  Loader2,
  MessageCircle,
  Network,
  Pin,
  PinOff,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  VAULT_KIND_DESCRIPTIONS,
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
  concept: 'Explanation',
  playbook: 'Playbook content',
};

const BODY_PLACEHOLDERS: Record<VaultKind, string> = {
  command: 'nmap -sS -sV -p- 10.0.0.5\n\nWhy: full TCP port discovery with service detection.\nWhen: initial enumeration against an authorized lab target.',
  procedure: '1. Identify the target and scope\n2. Run discovery\n3. Enumerate exposed services\n4. Record findings\n5. Validate the next hypothesis',
  cheat_sheet: 'Discovery\n  nmap -sn 10.0.0.0/24\n\nService scan\n  nmap -sV -p 22,80,443 10.0.0.5\n\nNotes\n  Keep the scope explicit.',
  script: '#!/usr/bin/env bash\n\n# Add the script here, then document inputs, outputs and assumptions.',
  concept: 'Explain the idea in your own words. Add an example, the failure mode it prevents, and how you would recognize it in practice.',
  playbook: 'Goal\n\nPhase 1 — Discover\n\nPhase 2 — Enumerate\n\nPhase 3 — Validate\n\nLessons learned',
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
  const [saving, setSaving] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [kindFilter, setKindFilter] = React.useState<'all' | VaultKind>('all');
  const [pinnedOnly, setPinnedOnly] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editor, setEditor] = React.useState<EditorState>(() => blankEditor());

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listVaultItems());
    } catch (error) {
      console.error('Failed to load Vault:', error);
      toast.error(error instanceof Error ? error.message : 'Vault could not be loaded');
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

  const stats = React.useMemo(() => ({
    total: items.length,
    commands: items.filter((item) => item.kind === 'command' || item.kind === 'script').length,
    playbooks: items.filter((item) => item.kind === 'playbook' || item.kind === 'procedure').length,
    pinned: items.filter((item) => item.pinned).length,
  }), [items]);

  function selectItem(item: VaultItem) {
    setCreating(false);
    setActiveId(item.id);
    setEditor(itemEditor(item));
  }

  function startCreate(kind: VaultKind = 'command') {
    setActiveId(null);
    setCreating(true);
    setEditor(blankEditor(kind));
  }

  async function createItem() {
    if (!editor.title.trim()) {
      toast.error('Give this knowledge object a title.');
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
      setItems((current) => [created, ...current]);
      setCreating(false);
      setActiveId(created.id);
      setEditor(itemEditor(created));
      toast.success('Saved to your Vault.');
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
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditor(itemEditor(updated));
      toast.success('Vault item updated.');
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
      setItems((current) => current.filter((item) => item.id !== active.id));
      setActiveId(null);
      setCreating(false);
      toast.success('Moved out of the active Vault.');
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
      setItems((current) => current.filter((item) => item.id !== active.id));
      setActiveId(null);
      setCreating(false);
      toast.success('Vault item deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete Vault item');
    } finally {
      setSaving(false);
    }
  }

  function handoff(item: VaultItem, destination: 'lab' | 'board' | 'collaboration') {
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
      // Handoff still works as navigation even when browser storage is unavailable.
    }

    if (destination === 'lab') {
      if (item.kind === 'command' || item.kind === 'script') {
        void navigator.clipboard?.writeText(item.body).then(
          () => toast.success('Knowledge copied. Paste it into your authorized lab terminal when ready.'),
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
      toast.success('Copied from Vault.');
    } catch {
      toast.error('The browser could not copy this item.');
    }
  }

  const editorVisible = creating || !!active;
  const activeKind = editor.kind;
  const ActiveKindIcon = KIND_ICONS[activeKind];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-primary/5 p-5 shadow-sm md:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/10">
                <LibraryBig className="h-5 w-5" />
              </div>
              <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" /> Knowledge system</Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Vault</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Capture technical knowledge once, then carry it into explanation, collaboration and hands-on practice. Commands, procedures, cheat sheets, scripts, concepts and playbooks become reusable Oxsig objects instead of loose files.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => startCreate('cheat_sheet')}><BookOpenCheck className="h-4 w-4" /> New cheat sheet</Button>
            <Button variant="outline" onClick={() => startCreate('playbook')}><LibraryBig className="h-4 w-4" /> New playbook</Button>
            <Button onClick={() => startCreate('command')}><Plus className="h-4 w-4" /> Capture knowledge</Button>
          </div>
        </div>
        <div className="relative mt-5 flex items-start gap-2 rounded-xl border border-primary/15 bg-background/70 p-3 text-xs text-muted-foreground backdrop-blur">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p><span className="font-medium text-foreground">Not generic cloud storage.</span> Vault stores structured technical knowledge. Large ISOs, VM images and arbitrary binary dumps belong outside this workspace; feature-owned assets remain with Boards, Collaboration and Cyber Lab.</p>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Knowledge objects', stats.total, LibraryBig],
          ['Commands & scripts', stats.commands, SquareTerminal],
          ['Procedures & playbooks', stats.playbooks, ListChecks],
          ['Pinned', stats.pinned, Pin],
        ].map(([label, value, Icon]) => {
          const StatIcon = Icon as React.ComponentType<{ className?: string }>;
          return (
            <Card key={label as string}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><StatIcon className="h-4 w-4" /></div>
                <div><p className="text-2xl font-semibold leading-none">{value as number}</p><p className="mt-1 text-xs text-muted-foreground">{label as string}</p></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands, topics, tags or content" className="pl-9" />
                </div>
                <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as 'all' | VaultKind)} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="Filter Vault by type">
                  <option value="all">All knowledge</option>
                  {VAULT_KINDS.map((kind) => <option key={kind} value={kind}>{VAULT_KIND_LABELS[kind]}</option>)}
                </select>
                <Button variant={pinnedOnly ? 'secondary' : 'outline'} onClick={() => setPinnedOnly((value) => !value)}>
                  <Pin className="h-4 w-4" /> {pinnedOnly ? 'Pinned only' : 'Pinned'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <Card><CardContent className="flex items-center justify-center py-20 text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your technical memory…</CardContent></Card>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted"><Brain className="h-6 w-6" /></div>
                <h2 className="font-semibold">{items.length === 0 ? 'Your Vault starts with one useful thing.' : 'Nothing matches this view.'}</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">{items.length === 0 ? 'Capture a command you keep forgetting, a procedure you want to repeat, or the first playbook for a topic you are learning.' : 'Change the search or filter to find another knowledge object.'}</p>
                {items.length === 0 && <Button className="mt-4" onClick={() => startCreate('command')}><Plus className="h-4 w-4" /> Capture first item</Button>}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((item) => {
                const Icon = KIND_ICONS[item.kind];
                const snippet = firstUsefulLine(item);
                const selected = activeId === item.id;
                return (
                  <button key={item.id} type="button" onClick={() => selectItem(item)} className={`group rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${selected ? 'border-primary/60 bg-primary/5 shadow-sm' : 'bg-card'}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary"><Icon className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-normal">{VAULT_KIND_LABELS[item.kind]}</Badge>
                          {item.pinned && <Pin className="h-3 w-3 text-primary" />}
                          <span className="ml-auto text-[10px] text-muted-foreground">{relativeDate(item.updatedAt)}</span>
                        </div>
                        <h3 className="mt-2 truncate font-semibold">{item.title}</h3>
                        {item.summary && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</p>}
                        {snippet && <div className="mt-3 truncate rounded-md bg-muted/60 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">{snippet}</div>}
                        {item.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{item.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">#{tag}</span>)}</div>}
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          {!editorVisible ? (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Knowledge becomes action</CardTitle>
                <CardDescription>Select an item or capture something new. Vault objects can continue directly into the rest of Oxsig.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  [FlaskConical, 'Practice', 'Carry commands, scripts and procedures into Cyber Lab.'],
                  [Network, 'Explain', 'Open Boards and turn the knowledge into a visual explanation.'],
                  [MessageCircle, 'Discuss', 'Bring the idea into Collaboration when you need another person.'],
                ].map(([Icon, title, description]) => {
                  const FlowIcon = Icon as React.ComponentType<{ className?: string }>;
                  return <div key={title as string} className="flex gap-3 rounded-xl border p-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"><FlowIcon className="h-4 w-4" /></div><div><p className="text-sm font-medium">{title as string}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description as string}</p></div></div>;
                })}
                <Button className="w-full" onClick={() => startCreate('command')}><Plus className="h-4 w-4" /> Capture knowledge</Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden shadow-sm">
              <CardHeader className="border-b bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/15 to-purple-500/15 text-primary"><ActiveKindIcon className="h-5 w-5" /></div>
                    <div className="min-w-0"><CardTitle className="truncate text-lg">{creating ? 'Capture knowledge' : active?.title}</CardTitle><CardDescription>{creating ? VAULT_KIND_DESCRIPTIONS[editor.kind] : 'Edit the knowledge object, then continue it somewhere useful.'}</CardDescription></div>
                  </div>
                  {!creating && active && <Button size="icon" variant="ghost" disabled={saving} onClick={() => void togglePin(active)} title={active.pinned ? 'Unpin' : 'Pin'}>{active.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</Button>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-medium">Type<select value={editor.kind} onChange={(event) => setEditor((current) => ({ ...current, kind: event.target.value as VaultKind }))} className="h-9 w-full rounded-md border bg-background px-3 text-sm" disabled={saving}>{VAULT_KINDS.map((kind) => <option key={kind} value={kind}>{VAULT_KIND_LABELS[kind]}</option>)}</select></label>
                  <label className="space-y-1.5 text-xs font-medium">Language / environment<Input value={editor.language} onChange={(event) => setEditor((current) => ({ ...current, language: event.target.value }))} placeholder="bash, Python, Linux…" maxLength={64} disabled={saving} /></label>
                </div>
                <label className="block space-y-1.5 text-xs font-medium">Title<Input value={editor.title} onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))} placeholder="Nmap service enumeration" maxLength={160} disabled={saving} /></label>
                <label className="block space-y-1.5 text-xs font-medium">What is this for?<Textarea value={editor.summary} onChange={(event) => setEditor((current) => ({ ...current, summary: event.target.value }))} placeholder="A short explanation of when and why you would use this." className="min-h-[76px]" maxLength={500} disabled={saving} /></label>
                <label className="block space-y-1.5 text-xs font-medium">{BODY_LABELS[editor.kind]}<Textarea value={editor.body} onChange={(event) => setEditor((current) => ({ ...current, body: event.target.value }))} placeholder={BODY_PLACEHOLDERS[editor.kind]} className="min-h-[260px] font-mono text-xs leading-5" maxLength={100000} disabled={saving} /></label>
                <label className="block space-y-1.5 text-xs font-medium">Tags<Input value={editor.tags} onChange={(event) => setEditor((current) => ({ ...current, tags: event.target.value }))} placeholder="nmap, enumeration, networking" disabled={saving} /><span className="block font-normal text-muted-foreground">Comma-separated, up to 12 tags.</span></label>

                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {creating ? <Button onClick={() => void createItem()} disabled={saving || !editor.title.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save to Vault</Button> : <Button onClick={() => void saveActive()} disabled={saving || !editor.title.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save changes</Button>}
                  <Button variant="outline" onClick={() => { setCreating(false); if (active) setEditor(itemEditor(active)); else setActiveId(null); }} disabled={saving}>Cancel</Button>
                </div>

                {!creating && active && (
                  <div className="space-y-3 border-t pt-4">
                    <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Continue in Oxsig</p><p className="mt-1 text-xs text-muted-foreground">The Vault keeps the knowledge object as the source while you practice, explain or discuss it.</p></div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button variant="outline" className="justify-start" onClick={() => handoff(active, 'lab')}><FlaskConical className="h-4 w-4" /> Practice in Cyber Lab</Button>
                      <Button variant="outline" className="justify-start" onClick={() => handoff(active, 'board')}><Network className="h-4 w-4" /> Explain on Board</Button>
                      <Button variant="outline" className="justify-start" onClick={() => handoff(active, 'collaboration')}><MessageCircle className="h-4 w-4" /> Discuss</Button>
                      <Button variant="outline" className="justify-start" onClick={() => void copyBody(active)}><Copy className="h-4 w-4" /> Copy content</Button>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void archiveActive()} disabled={saving}><Archive className="h-4 w-4" /> Archive</Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void removeActive()} disabled={saving}><Trash2 className="h-4 w-4" /> Delete</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> The Oxsig knowledge loop</CardTitle><CardDescription>Vault is designed to connect the major workspaces rather than become another isolated app.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {[
            ['Collaborate', 'Discuss and discover knowledge with other people.', MessageCircle],
            ['Boards', 'Explain knowledge visually and make it teachable.', Network],
            ['Cyber Lab', 'Test the knowledge against a real environment.', FlaskConical],
            ['Vault', 'Capture what worked so it becomes reusable.', LibraryBig],
          ].map(([title, description, Icon], index) => {
            const LoopIcon = Icon as React.ComponentType<{ className?: string }>;
            return <div key={title as string} className="relative rounded-xl border p-4"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><LoopIcon className="h-4 w-4" /></div><p className="text-sm font-semibold">{title as string}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{description as string}</p>{index < 3 && <ChevronRight className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-background text-muted-foreground md:block" />}</div>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}