from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)
    print(f"updated {path}")


def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


def sub(text: str, pattern: str, repl: str, label: str) -> str:
    out, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return out


# Vault: restore create action and make mobile list/detail navigation explicit.
p = "src/app/vault/page.tsx"
s = read(p)
s = one(
    s,
    '      <div className="grid min-h-[calc(100dvh-5rem)] gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">\n        <div className="space-y-4">',
    '      <div className="grid min-h-[calc(100dvh-5rem)] gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">\n        <div className={editorVisible ? \'hidden space-y-4 lg:block\' : \'space-y-4\'}>',
    "vault mobile list",
)
s = one(
    s,
    '''                <Button variant={pinnedOnly ? 'secondary' : 'outline'} onClick={() => setPinnedOnly((value) => !value)}>
                  <Pin className="h-4 w-4" /> {pinnedOnly ? 'Pinned only' : 'Pinned'}
                </Button>
              </div>''',
    '''                <Button variant={pinnedOnly ? 'secondary' : 'outline'} onClick={() => setPinnedOnly((value) => !value)}>
                  <Pin className="h-4 w-4" /> {pinnedOnly ? 'Pinned only' : 'Pinned'}
                </Button>
                <Button onClick={() => startCreate('command')}><Plus className="h-4 w-4" /> New item</Button>
              </div>''',
    "vault new item",
)
s = s.replace('placeholder="Search commands, topics, tags or content"', 'placeholder="Search Vault"')
s = one(
    s,
    '        <div className="lg:sticky lg:top-20 lg:self-start">\n          {!editorVisible ? (',
    '''        <div className={editorVisible ? 'lg:sticky lg:top-20 lg:self-start' : 'hidden lg:block lg:sticky lg:top-20 lg:self-start'}>
          {editorVisible && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mb-2 lg:hidden"
              onClick={() => {
                if (!canDiscardChanges()) return;
                const next = blankEditor();
                setCreating(false);
                setActiveId(null);
                setEditor(next);
                setBaselineEditor(next);
              }}
            >
              Back to Vault
            </Button>
          )}
          {!editorVisible ? (''',
    "vault mobile editor",
)
s = re.sub(
    r"\n\s*<CardDescription>\{creating \? VAULT_KIND_DESCRIPTIONS\[editor\.kind\] : 'Edit the knowledge object, then continue it somewhere useful\.'\}</CardDescription>",
    "",
    s,
    count=1,
)
s = s.replace("  VAULT_KIND_DESCRIPTIONS,\n", "")
s = one(
    s,
    '<div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Continue in Oxsig</p><p className="mt-1 text-xs text-muted-foreground">The Vault keeps the knowledge object as the source while you practice, explain or discuss it.</p></div>',
    '<p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Continue in OXSIG</p>',
    "vault continuation copy",
)
write(p, s)


# Collaboration: list -> conversation on mobile, with a direct way back to sessions.
p = "src/components/collab/CollaborationWorkspace.tsx"
s = read(p)
s = one(
    s,
    '        <aside className="border-b bg-muted/15 md:border-b-0 md:border-r">',
    "        <aside className={activeSession ? 'hidden border-b bg-muted/15 md:block md:border-b-0 md:border-r' : 'border-b bg-muted/15 md:border-b-0 md:border-r'}>",
    "collab mobile sessions",
)
s = one(
    s,
    '        <section className="flex min-w-0 flex-col bg-background/50">',
    "        <section className={activeSession ? 'flex min-w-0 flex-col bg-background/50' : 'hidden min-w-0 flex-col bg-background/50 md:flex'}>",
    "collab mobile conversation",
)
s = one(
    s,
    '''              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur">
                <div className="min-w-0">''',
    '''              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 md:hidden"
                  onClick={() => { activeIdRef.current = null; setActiveId(null); }}
                >
                  Sessions
                </Button>
                <div className="min-w-0 flex-1">''',
    "collab sessions back",
)
s = one(
    s,
    '        <aside className="border-t bg-muted/10 md:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0">',
    "        <aside className={activeSession ? 'border-t bg-muted/10 md:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0' : 'hidden border-t bg-muted/10 md:col-span-2 md:block xl:col-span-1 xl:border-l xl:border-t-0'}>",
    "collab mobile detail",
)
write(p, s)


# Live Workspace: list -> detail navigation on mobile.
p = "src/app/live/page.tsx"
s = read(p)
s = one(
    s,
    '        <aside>\n          <Card>',
    "        <aside className={selectedId ? 'hidden md:block' : ''}>\n          <Card>",
    "live mobile list",
)
s = one(
    s,
    '        <main className="space-y-4">',
    "        <main className={selectedId ? 'space-y-4' : 'hidden space-y-4 md:block'}>",
    "live mobile detail",
)
s = one(
    s,
    '<div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle>{detail.workspace.name}</CardTitle><CardDescription>{detail.workspace.description || \'Persistent technical workspace\'}</CardDescription></div><Badge>{ROLE_LABELS[detail.workspace.role]}</Badge></div>',
    '''<div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Button type="button" size="sm" variant="ghost" className="h-8 px-2 md:hidden" onClick={() => setSelectedId(null)}>Workspaces</Button>
                      <div className="min-w-0"><CardTitle className="truncate">{detail.workspace.name}</CardTitle>{detail.workspace.description && <CardDescription className="truncate">{detail.workspace.description}</CardDescription>}</div>
                    </div>
                    <Badge>{ROLE_LABELS[detail.workspace.role]}</Badge>
                  </div>''',
    "live mobile back",
)
write(p, s)


# Infrastructure Designer: canvas first on phones/tablets.
p = "src/components/labs/InfrastructureDesigner.tsx"
s = read(p)
s = one(
    s,
    '        <aside className="overflow-hidden rounded-2xl border bg-card">',
    '        <aside className="order-2 overflow-hidden rounded-xl border bg-card lg:order-1">',
    "infra palette order",
)
s = one(
    s,
    '        <section className="relative min-h-[520px] overflow-hidden rounded-xl border bg-muted/10 sm:min-h-[620px] lg:min-h-[calc(100dvh-8rem)]">',
    '        <section className="order-1 relative min-h-[520px] overflow-hidden rounded-xl border bg-muted/10 sm:min-h-[620px] lg:order-2 lg:min-h-[calc(100dvh-8rem)]">',
    "infra canvas order",
)
s = one(
    s,
    '        <aside className="overflow-hidden rounded-xl border bg-card lg:col-span-2 xl:col-span-1">',
    '        <aside className="order-3 overflow-hidden rounded-xl border bg-card lg:col-span-2 xl:col-span-1">',
    "infra inspector order",
)
write(p, s)


# AI Practitioner: use app chrome as the entry point and remove onboarding wall.
p = "src/components/labs/AiPractitionerDock.tsx"
s = read(p)
s = one(
    s,
    '  const [open, setOpen] = React.useState(false);',
    '''  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const openPractitioner = () => setOpen(true);
    window.addEventListener('oxsig:ai-practitioner:open', openPractitioner);
    return () => window.removeEventListener('oxsig:ai-practitioner:open', openPractitioner);
  }, []);''',
    "practitioner header event",
)
s = sub(
    s,
    r'''\n      \{!open && \(\n        <Button className="fixed bottom-5 right-5 z-40 h-12 rounded-full px-4 shadow-xl" onClick=\{\(\) => setOpen\(true\)\}>\n          <Sparkles className="h-4 w-4" /> AI Practitioner\n        </Button>\n      \)\}\n''',
    "\n",
    "practitioner floating trigger",
)
s = s.replace('                    <Badge variant="secondary" className="text-[10px]">Ask → Approve → Run → Explain</Badge>\n', "")
s = sub(
    s,
    r'''\n            \{!historyLoading && history\.length === 0 && entries\.length === 0 && \([\s\S]*?\n            \)\}\n\n            \{entries\.map''',
    "\n\n            {entries.map",
    "practitioner onboarding",
)
s = sub(
    s,
    r'''\n            \{!running && \(\n              <div className="mb-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">AI chat is available now\. Start a Cyber Lab only when you want the practitioner to execute an approved command\.</div>\n            \)\}\n''',
    "\n",
    "practitioner composer banner",
)
write(p, s)
