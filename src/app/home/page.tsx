'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Box,
  LibraryBig,
  MessageCircle,
  RadioTower,
  Settings2,
  Terminal,
  Sparkles,
  Boxes,
  ShieldCheck,
} from 'lucide-react';
import { LearningAnalyticsDashboard } from '@/components/learning/LearningAnalyticsDashboard';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/use-auth';
import type { LearnerProgressSummary } from '@/lib/learning/progress-contract';

const actions = [
  { href: '/labs', label: 'Cyber Lab', action: 'Start lab', icon: Box },
  { href: '/live', label: 'Live Workspace', action: 'Open workspace', icon: RadioTower },
  { href: '/collab', label: 'Collaboration', action: 'Open session', icon: MessageCircle },
  { href: '/collab/storyboards', label: 'Boards', action: 'Open board', icon: BookOpen },
  { href: '/vault', label: 'Vault', action: 'Open Vault', icon: LibraryBig },
  { href: '/manage', label: 'Resources', action: 'Manage', icon: Settings2 },
];

export default function HomePage() {
  const { isAuthenticated, profileError } = useAuth();
  const [progress, setProgress] = React.useState<LearnerProgressSummary | null>(null);
  const [progressLoading, setProgressLoading] = React.useState(false);

  React.useEffect(() => {
    if (!isAuthenticated) {
      setProgress(null);
      setProgressLoading(false);
      return;
    }

    let cancelled = false;
    setProgressLoading(true);
    void fetch('/api/users/me/progress', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!cancelled && body?.progress) setProgress(body.progress as LearnerProgressSummary);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setProgressLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const activeLab = progress?.labs.activeLab;

  return (
    <div className="oxsig-console space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workspace / Overview</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Command center</h1>
        </div>
        <button type="button" className="oxsig-helper-action inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium" onClick={() => window.dispatchEvent(new CustomEvent('oxsig:ai-helper:open'))}>
          <Sparkles className="h-4 w-4 text-primary" /> AI Helper
        </button>
      </div>
      {profileError && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Account details are loading.
        </div>
      )}

      {activeLab && (
        <Link href="/labs" className="group block">
          <Card className="overflow-hidden border-primary/20 bg-primary/[0.035] transition hover:border-primary/40 hover:shadow-md">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Box className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{activeLab.name}</p>
                    <Badge variant={activeLab.status === 'running' ? 'default' : 'outline'} className="capitalize">{activeLab.status}</Badge>
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                Resume lab <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </CardContent>
          </Card>
        </Link>
      )}

      <section className="oxsig-launch-grid" aria-label="Workspace actions">
        <Link href="/labs" className="oxsig-lab-launch group">
          <div className="flex items-center justify-between gap-3">
            <span className="oxsig-launch-icon"><Terminal className="h-6 w-6" /></span>
            <span className="rounded-md border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary">Cyber Lab</span>
          </div>
          <div className="my-6 sm:my-8">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Hands-on workspace</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{activeLab ? 'Open Cyber Lab' : 'Start a lab'}</h2>
            <ol className="oxsig-workflow-map mt-5" aria-label="Lab workflow">
              {[
                { label: 'Build', color: 'boards', icon: Boxes },
                { label: 'Run', color: 'labs', icon: Terminal },
                { label: 'Review', color: 'evidence', icon: ShieldCheck },
                { label: 'Save', color: 'vault', icon: LibraryBig },
              ].map(({ label, color, icon: FlowIcon }) => (
                <li key={label}><span className="oxsig-workspace-icon" data-workspace-color={color}><FlowIcon className="h-4 w-4" /></span><span>{label}</span></li>
              ))}
            </ol>
          </div>
          <span className="inline-flex min-h-11 items-center justify-between gap-6 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
            {activeLab ? 'Open lab' : 'Start lab'} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
        <div className="oxsig-workspace-list rounded-xl border bg-card">
          <div className="border-b px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold">Workspaces</h2>
          </div>
          {actions.filter((item) => item.href !== '/labs').map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} data-workspace-color={item.href === '/collab/storyboards' ? 'boards' : item.href.slice(1)} className="oxsig-workspace-row group flex min-w-0 items-center gap-3 px-4 py-3 sm:px-5">
                <span className="oxsig-workspace-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground transition group-hover:border-primary/40 group-hover:text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">{item.label}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">{item.action}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            );
          })}
        </div>
      </section>

      {progressLoading && !progress && <div role="status" className="text-sm text-muted-foreground">Loading workspace activity…</div>}

      {isAuthenticated && progress && (
        <details className="group overflow-hidden rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold sm:px-5">
            <span>Progress</span>
            <span className="text-xs font-normal text-muted-foreground group-open:hidden">View</span>
            <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
          </summary>
          <div className="border-t p-3 sm:p-5">
            <LearningAnalyticsDashboard progress={progress} compact />
          </div>
        </details>
      )}
    </div>
  );
}
