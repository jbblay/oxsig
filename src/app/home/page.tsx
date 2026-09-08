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
    <div className="space-y-5">
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Workspace actions">
        {actions.map((item) => {
          const Icon = item.icon;
          const action = item.href === '/labs' && activeLab ? 'Open lab' : item.action;
          return (
            <Link key={item.href} href={item.href} className="group min-w-0">
              <Card className="h-full transition hover:border-primary/30 hover:shadow-md">
                <CardContent className="flex min-h-24 items-center gap-3 p-4 sm:p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition group-hover:bg-primary/10 group-hover:text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{action}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      {progressLoading && !progress && <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />}

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