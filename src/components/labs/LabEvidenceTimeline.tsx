'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, Clipboard, Download, FileText, History, LibraryBig } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  getWorkspaceActivity,
  recordWorkspaceActivity,
  subscribeWorkspaceActivity,
  type WorkspaceActivity,
} from '@/lib/persistence/workspace-activity';

function time(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function buildReport(items: WorkspaceActivity[]) {
  const lines = items.map((item) => `- ${new Date(item.at).toLocaleString()} — ${item.label}${item.detail ? ` (${item.detail})` : ''}`);
  return [
    '# OXSIG Technical Session Report',
    '',
    `Generated: ${new Date().toLocaleString()}`,
    '',
    '## Operational timeline',
    '',
    ...(lines.length ? lines : ['- No session activity recorded yet.']),
    '',
    '## Evidence note',
    '',
    'Provider-attested evidence, analysis, identifiers, and limitations are preserved in the Evidence workspace above when available.',
    '',
    '## Workflow',
    '',
    'Build → Run → Review evidence → Save reusable knowledge to Vault.',
    '',
  ].join('\n');
}

export default function LabEvidenceTimeline() {
  const [items, setItems] = React.useState<WorkspaceActivity[]>([]);
  const refresh = React.useCallback(() => {
    setItems(getWorkspaceActivity().filter((item) => item.color === 'labs' || item.kind === 'action').slice(0, 10));
  }, []);

  React.useEffect(() => {
    refresh();
    return subscribeWorkspaceActivity(refresh);
  }, [refresh]);

  const report = React.useMemo(() => buildReport(items), [items]);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      recordWorkspaceActivity({ label: 'Generated session report', detail: 'Copied to clipboard', href: '/labs', color: 'labs', kind: 'action' });
      toast.success('Session report copied.');
    } catch {
      toast.error('Could not copy report.');
    }
  };

  const downloadReport = () => {
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `oxsig-session-report-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    recordWorkspaceActivity({ label: 'Generated session report', detail: 'Markdown downloaded', href: '/labs', color: 'labs', kind: 'action' });
    toast.success('Session report generated.');
  };

  return (
    <section className="mt-3 overflow-hidden rounded-lg border bg-card/60" aria-labelledby="evidence-timeline-title">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <History className="h-4 w-4 text-cyan-500" />
        <div className="mr-auto">
          <h2 id="evidence-timeline-title" className="text-xs font-semibold">Session timeline</h2>
          <p className="text-[10px] text-muted-foreground">Operational context around your evidence.</p>
        </div>
        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void copyReport()}>
          <Clipboard className="h-3.5 w-3.5" /> Copy report
        </Button>
        <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={downloadReport}>
          <Download className="h-3.5 w-3.5" /> Generate report
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs">
          <Link href="/vault"><LibraryBig className="h-3.5 w-3.5" /> Vault</Link>
        </Button>
      </div>

      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_230px]">
        <div className="divide-y">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Timeline starts as you move through the lab.</div>
          ) : items.map((item) => (
            <div key={item.id} className="flex items-start gap-3 px-3 py-2.5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-500/10 text-cyan-500"><CheckCircle2 className="h-3 w-3" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{item.label}</p>
                {item.detail && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.detail}</p>}
              </div>
              <time className="shrink-0 font-mono text-[9px] text-muted-foreground">{time(item.at)}</time>
            </div>
          ))}
        </div>
        <aside className="border-t bg-muted/10 p-3 md:border-l md:border-t-0">
          <div className="flex items-center gap-2 text-xs font-semibold"><FileText className="h-3.5 w-3.5" /> Report pipeline</div>
          <div className="mt-3 space-y-2 text-[10px] text-muted-foreground">
            <p>1. Provider evidence</p>
            <p>2. OXSIG interpretation</p>
            <p>3. Session timeline</p>
            <p>4. Export or save to Vault</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
