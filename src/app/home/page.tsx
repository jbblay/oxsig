'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Box,
  LibraryBig,
  Sparkles,
} from 'lucide-react';
import { CapabilityPathExplorer } from '@/components/learning/CapabilityPathExplorer';
import { LearningAnalyticsDashboard } from '@/components/learning/LearningAnalyticsDashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/use-auth';
import type { LearnerProgressSummary } from '@/lib/learning/progress-contract';

function AnalyticsLoading() {
  return (
    <section className="space-y-4" aria-label="Loading learning analytics">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="h-48 animate-pulse rounded-2xl border bg-muted/40" />
        <div className="h-48 animate-pulse rounded-2xl border bg-muted/30" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl border bg-muted/30" />)}
      </div>
    </section>
  );
}

export default function HomePage() {
  const { user, isAuthenticated, profileError } = useAuth();
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
      .finally(() => { if (!cancelled) setProgressLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const activeCourse = progress?.academy.activeCourse;
  const activeLab = progress?.labs.activeLab;
  const hasContinuation = Boolean(activeCourse || activeLab);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_36%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.35))] shadow-sm">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(hsl(var(--border)/0.5)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.5)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <Badge variant="secondary" className="mb-4 w-fit gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Your dashboard</Badge>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                {isAuthenticated ? `Build capability${user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.` : 'Build capability, not a pile of unfinished courses.'}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Choose a path, continue the next meaningful step, practice in a prepared lab, and let OXSIG track what you can actually demonstrate.
              </p>
            </div>
            {progress && (
              <div className="grid min-w-[220px] grid-cols-2 gap-2 rounded-2xl border bg-background/70 p-3 backdrop-blur-sm">
                <div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Level</p><p className="mt-1 text-xl font-semibold">{progress.rewards.level}</p></div>
                <div className="rounded-xl bg-muted/50 p-3"><p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Streak</p><p className="mt-1 text-xl font-semibold">{progress.activity.streakDays}<span className="ml-1 text-xs font-normal text-muted-foreground">days</span></p></div>
              </div>
            )}
          </div>
          {profileError && <p className="mt-4 text-sm text-amber-600">Your account is signed in, but some profile information is still loading.</p>}
        </div>
      </section>

      {hasContinuation && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Continue where you left off</p>
              <h2 className="mt-1 text-xl font-semibold">Your next actions</h2>
            </div>
            {progress && progress.activity.streakDays > 0 && <Badge variant="outline">Current streak: {progress.activity.streakDays} days</Badge>}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {activeCourse && (
              <Link href="/academy" className="group">
                <Card className="h-full transition hover:border-sky-500/30 hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div><CardDescription>Continue learning</CardDescription><CardTitle className="mt-1 text-lg">{activeCourse.title}</CardTitle></div>
                      <Badge className="bg-sky-600">{activeCourse.score}%</Badge>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-500 transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, activeCourse.totalLessons > 0 ? (activeCourse.completedLessons / activeCourse.totalLessons) * 100 : 0))}%` }} /></div>
                    <span className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-primary">Continue in Academy <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
                  </CardHeader>
                </Card>
              </Link>
            )}
            {activeLab && (
              <Link href="/labs" className="group">
                <Card className="h-full transition hover:border-emerald-500/30 hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div><CardDescription>Continue practicing</CardDescription><CardTitle className="mt-1 text-lg">{activeLab.name}</CardTitle></div>
                      <Badge variant={activeLab.status === 'running' ? 'default' : 'outline'} className={activeLab.status === 'running' ? 'bg-emerald-600 capitalize' : 'capitalize'}>{activeLab.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Your existing lab state is still available.</p>
                    <span className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-primary">Open Cyber Lab <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
                  </CardHeader>
                </Card>
              </Link>
            )}
          </div>
        </section>
      )}

      <CapabilityPathExplorer />

      {isAuthenticated && progressLoading && !progress && <AnalyticsLoading />}
      {isAuthenticated && progress && <LearningAnalyticsDashboard progress={progress} compact />}

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="overflow-hidden">
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400"><BookOpen className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="font-semibold">Explain what you are working on</p><p className="mt-1 text-sm text-muted-foreground">Use a Board when a topology, process or shared explanation is more useful than another lesson.</p></div>
            <Button variant="ghost" size="icon" asChild><Link href="/collab/storyboards" aria-label="Open Boards"><ArrowRight className="h-4 w-4" /></Link></Button>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><LibraryBig className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="font-semibold">Keep what proved useful</p><p className="mt-1 text-sm text-muted-foreground">Save commands, procedures and discoveries to Vault as they become relevant to your path.</p></div>
            <Button variant="ghost" size="icon" asChild><Link href="/vault" aria-label="Open Vault"><ArrowRight className="h-4 w-4" /></Link></Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
