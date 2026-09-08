'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Box,
  Boxes,
  LibraryBig,
  LogIn,
  MessageCircle,
  RadioTower,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserRound,
} from 'lucide-react';
import GuestSampleFlow from '@/components/app/GuestSampleFlow';
import ProgressBadgeRail from '@/components/app/ProgressBadgeRail';
import RecentWorkspaceStrip from '@/components/app/RecentWorkspaceStrip';
import TerminalActivityStrip from '@/components/app/TerminalActivityStrip';
import { LearningAnalyticsDashboard } from '@/components/learning/LearningAnalyticsDashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';
import type { LearnerProgressSummary } from '@/lib/learning/progress-contract';

const actions = [
  { href: '/labs', label: 'Cyber Lab', hint: 'Build and run', icon: Terminal, color: 'labs' },
  { href: '/live', label: 'Live Workspace', hint: 'Shared workspace', icon: RadioTower, color: 'live' },
  { href: '/collab', label: 'Collaboration', hint: 'Messages and people', icon: MessageCircle, color: 'collab' },
  { href: '/collab/storyboards', label: 'Boards', hint: 'Draw and explain', icon: BookOpen, color: 'boards' },
  { href: '/vault', label: 'Vault', hint: 'Reusable knowledge', icon: LibraryBig, color: 'vault' },
  { href: '/manage', label: 'Resources', hint: 'Manage work', icon: Settings2, color: 'manage' },
] as const;

const workflow = [
  { href: '/labs', label: 'Build', color: 'boards', icon: Boxes },
  { href: '/labs', label: 'Run', color: 'labs', icon: Terminal },
  { href: '/labs', label: 'Review', color: 'evidence', icon: ShieldCheck },
  { href: '/vault', label: 'Save', color: 'vault', icon: LibraryBig },
] as const;

export default function HomePage() {
  const { isAuthenticated, isLoading: authLoading, profileError } = useAuth();
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
  const labRunning = activeLab?.status === 'running';
  const guestMode = !authLoading && !isAuthenticated;

  return (
    <div className="oxsig-console mx-auto max-w-6xl space-y-4">
      <div className="flex min-h-10 flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold tracking-tight">Workspace</h1>
        <Button size="sm" variant="outline" className="h-9 gap-2" onClick={() => window.dispatchEvent(new CustomEvent('oxsig:ai-helper:open'))}>
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">AI Helper</span>
        </Button>
        <Button asChild size="sm" className="h-9">
          <Link href="/labs"><Terminal className="mr-2 h-4 w-4" />{activeLab ? 'Open lab' : 'Start lab'}</Link>
        </Button>
      </div>

      {guestMode && (
        <div className="flex flex-col gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.045] px-3 py-2.5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-cyan-500/10 text-cyan-500"><UserRound className="h-4 w-4" /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><p className="text-xs font-semibold">Guest workspace</p><Badge variant="outline" className="h-5 px-1.5 text-[9px]">Explore</Badge></div>
              <p className="truncate text-[11px] text-muted-foreground">Browse the dashboard now. Create an account when you want to save or use protected actions.</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5 sm:ml-auto">
            <Button asChild size="sm" variant="ghost" className="h-8 px-2.5 text-xs"><Link href="/sign-in"><LogIn className="mr-1.5 h-3.5 w-3.5" />Log in</Link></Button>
            <Button asChild size="sm" className="h-8 px-2.5 text-xs"><Link href="/sign-up">Sign up</Link></Button>
          </div>
        </div>
      )}

      {guestMode && <GuestSampleFlow />}

      {profileError && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Account details are loading.
        </div>
      )}

      {progress && <ProgressBadgeRail progress={progress} compact />}

      {activeLab && (
        <Link href="/labs" className="oxsig-active-strip group flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5">
          <span className="oxsig-workspace-icon h-8 w-8 rounded-md" data-workspace-color="labs"><Box className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">{activeLab.name}</span>
              <Badge variant={activeLab.status === 'running' ? 'default' : 'outline'} className="h-5 shrink-0 px-1.5 text-[10px] capitalize">{activeLab.status}</Badge>
            </span>
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">Resume</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>
      )}

      <RecentWorkspaceStrip />
      <TerminalActivityStrip running={labRunning} label={activeLab ? `${activeLab.name} activity` : 'Terminal activity'} />

      <section aria-labelledby="workspace-launcher-title">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="workspace-launcher-title" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Open</h2>
        </div>
        <div className="oxsig-action-grid">
          {actions.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} data-workspace-color={item.color} className="oxsig-action-button group">
                <span className="oxsig-workspace-icon h-9 w-9 rounded-md"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{item.hint}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="lab-flow-title" className="rounded-lg border bg-card/60 p-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <h2 id="lab-flow-title" className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:w-28 sm:shrink-0">Lab flow</h2>
          <div className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4">
            {workflow.map((item, index) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} href={item.href} data-workspace-color={item.color} className="oxsig-flow-button group">
                  <span className="text-[10px] tabular-nums text-muted-foreground">0{index + 1}</span>
                  <span className="oxsig-workspace-icon h-7 w-7 rounded-md"><Icon className="h-3.5 w-3.5" /></span>
                  <span className="text-xs font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {progressLoading && !progress && <div role="status" className="px-1 text-xs text-muted-foreground">Loading activity…</div>}

      {isAuthenticated && progress && (
        <details className="group overflow-hidden rounded-lg border bg-card/60">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-medium">
            <span>Progress</span>
            <span className="text-xs font-normal text-muted-foreground group-open:hidden">View</span>
            <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
          </summary>
          <div className="border-t p-3 sm:p-4">
            <LearningAnalyticsDashboard progress={progress} compact />
          </div>
        </details>
      )}
    </div>
  );
}
