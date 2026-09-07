'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Box,
  GraduationCap,
  LibraryBig,
  Loader2,
  Network,
  Sparkles,
  Users,
} from 'lucide-react';
import { LearningAnalyticsDashboard } from '@/components/learning/LearningAnalyticsDashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/use-auth';
import type { LearnerProgressSummary } from '@/lib/learning/progress-contract';

const intents = [
  {
    href: '/academy',
    title: 'Learn',
    description: 'Build a guided course around what you want to understand.',
    action: 'Open Academy',
    icon: GraduationCap,
    tone: 'border-sky-500/20 bg-sky-500/5 text-sky-600 dark:text-sky-400',
  },
  {
    href: '/labs',
    title: 'Practice',
    description: 'Open a prepared Linux or Windows environment and do the work.',
    action: 'Open Cyber Lab',
    icon: Box,
    tone: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400',
  },
  {
    href: '/labs',
    title: 'Build',
    description: 'Shape an environment visually, then launch only what OXSIG supports safely.',
    action: 'Open Designer',
    icon: Network,
    tone: 'border-violet-500/20 bg-violet-500/5 text-violet-600 dark:text-violet-400',
  },
  {
    href: '/live',
    title: 'Collaborate',
    description: 'Bring another person into the same technical session when the task needs it.',
    action: 'Open Live Workspace',
    icon: Users,
    tone: 'border-orange-500/20 bg-orange-500/5 text-orange-600 dark:text-orange-400',
  },
];

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
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-violet-500/10 shadow-sm">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
            <Badge variant="secondary" className="mb-4 w-fit gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Your learning space</Badge>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              {isAuthenticated ? `What are we building today${user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}?` : 'What are we building today?'}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Learn it, practice it, build the environment, or bring someone in. Your dashboard changes as you actually use OXSIG.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild><Link href="/academy"><GraduationCap className="h-4 w-4" /> Start learning</Link></Button>
              <Button variant="outline" asChild><Link href="/labs"><Box className="h-4 w-4" /> Open a lab</Link></Button>
            </div>
            {profileError && <p className="mt-4 text-sm text-amber-600">Your account is signed in, but some profile information is still loading.</p>}
          </div>

          <div className="relative min-h-[300px] border-t bg-muted/15 p-6 lg:border-l lg:border-t-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.12),transparent_58%)]" />
            <div className="relative flex h-full items-center justify-center">
              <div className="grid w-full max-w-sm grid-cols-2 gap-3">
                {intents.map(({ href, title, icon: Icon, tone }) => (
                  <Link key={title} href={href} className={`group flex min-h-28 flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md ${tone}`}>
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background/80 shadow-sm"><Icon className="h-5 w-5" /></span>
                    <div className="mt-4 flex items-center justify-between gap-2"><span className="font-semibold text-foreground">{title}</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {isAuthenticated && progressLoading && !progress && <AnalyticsLoading />}
      {isAuthenticated && progress && <LearningAnalyticsDashboard progress={progress} compact />}

      {hasContinuation && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Continue</h2>
              <p className="text-sm text-muted-foreground">Your live work, without another setup screen.</p>
            </div>
            {progress && progress.activity.streakDays > 0 && <Badge variant="outline">Current streak: {progress.activity.streakDays} days</Badge>}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {activeCourse && (
              <Link href="/academy" className="group">
                <Card className="h-full transition hover:border-sky-500/30 hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div><CardDescription>AI Academy</CardDescription><CardTitle className="mt-1 text-lg">{activeCourse.title}</CardTitle></div>
                      <Badge className="bg-sky-600">{activeCourse.score}%</Badge>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(0, Math.min(100, activeCourse.totalLessons > 0 ? (activeCourse.completedLessons / activeCourse.totalLessons) * 100 : 0))}%` }} /></div>
                    <span className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-primary">Continue learning <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
                  </CardHeader>
                </Card>
              </Link>
            )}
            {activeLab && (
              <Link href="/labs" className="group">
                <Card className="h-full transition hover:border-emerald-500/30 hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div><CardDescription>Cyber Lab</CardDescription><CardTitle className="mt-1 text-lg">{activeLab.name}</CardTitle></div>
                      <Badge variant={activeLab.status === 'running' ? 'default' : 'outline'} className={activeLab.status === 'running' ? 'bg-emerald-600 capitalize' : 'capitalize'}>{activeLab.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Your existing lab state is still available.</p>
                    <span className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-primary">Open lab <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
                  </CardHeader>
                </Card>
              </Link>
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Jump in</h2>
            <p className="text-sm text-muted-foreground">Four ways to move forward. OXSIG handles the infrastructure underneath.</p>
          </div>
          {progressLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {intents.map(({ href, title, description, action, icon: Icon, tone }) => (
            <Link key={`${href}-${title}`} href={href} className="group">
              <Card className={`h-full transition-all hover:-translate-y-1 hover:shadow-md ${tone}`}>
                <CardHeader className="space-y-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background shadow-sm"><Icon className="h-6 w-6" /></span>
                  <div>
                    <CardTitle className="text-base text-foreground">{title}</CardTitle>
                    <CardDescription className="mt-2 line-clamp-2 leading-6">{description}</CardDescription>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold">{action} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="overflow-hidden">
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400"><BookOpen className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="font-semibold">Explain it visually</p><p className="mt-1 text-sm text-muted-foreground">Turn a concept into a Board when drawing it makes more sense.</p></div>
            <Button variant="ghost" size="icon" asChild><Link href="/collab/storyboards" aria-label="Open Boards"><ArrowRight className="h-4 w-4" /></Link></Button>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><LibraryBig className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="font-semibold">Keep what mattered</p><p className="mt-1 text-sm text-muted-foreground">Save commands, concepts and procedures in Vault.</p></div>
            <Button variant="ghost" size="icon" asChild><Link href="/vault" aria-label="Open Vault"><ArrowRight className="h-4 w-4" /></Link></Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
