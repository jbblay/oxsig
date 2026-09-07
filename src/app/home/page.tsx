'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Box,
  Flame,
  GraduationCap,
  LibraryBig,
  Monitor,
  Network,
  Server,
  Sparkles,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/use-auth';

type ProgressSummary = {
  academy: {
    completedLessons: number;
    activeCourse: {
      title: string;
      completedLessons: number;
      totalLessons: number;
      score: number;
    } | null;
  };
  labs: {
    running: number;
    activeLab: {
      name: string;
      status: string;
      expiresAt: string | null;
    } | null;
  };
  activity: {
    streakDays: number;
  };
};

const intents = [
  {
    href: '/academy',
    title: 'Learn something',
    description: 'Tell AI Academy what you want to understand and get a guided course with practical checkpoints.',
    action: 'Choose a topic',
    icon: GraduationCap,
  },
  {
    href: '/labs',
    title: 'Practice on a real machine',
    description: 'Open a temporary Linux or Windows environment without setting up a local virtual machine first.',
    action: 'Open Cyber Lab',
    icon: Box,
  },
  {
    href: '/labs',
    title: 'Build an environment',
    description: 'Create a topology visually, then review what OXSIG can safely launch for you.',
    action: 'Open the designer',
    icon: Network,
  },
  {
    href: '/live',
    title: 'Work with someone',
    description: 'Bring a teammate into the same learning session and share access when the task needs it.',
    action: 'Open Live Workspace',
    icon: Users,
  },
];

export default function HomePage() {
  const { user, isAuthenticated, profileError } = useAuth();
  const [progress, setProgress] = React.useState<ProgressSummary | null>(null);

  React.useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void fetch('/api/users/me/progress', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!cancelled && body?.progress) setProgress(body.progress as ProgressSummary);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const activeCourse = progress?.academy.activeCourse;
  const activeLab = progress?.labs.activeLab;
  const hasContinuation = Boolean(activeCourse || activeLab);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-purple-500/10 shadow-sm">
        <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
          <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
            <Badge variant="secondary" className="mb-4 w-fit gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Ready when you are</Badge>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              {isAuthenticated ? `What do you want to do today${user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}?` : 'What do you want to do today?'}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Learn a topic, open a practice machine, build an environment or bring someone into the same session. OXSIG handles the setup behind the action you choose.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild><Link href="/academy"><GraduationCap className="h-4 w-4" /> Learn something</Link></Button>
              <Button variant="outline" asChild><Link href="/labs"><Box className="h-4 w-4" /> Start a lab</Link></Button>
            </div>
            {profileError && <p className="mt-4 text-sm text-amber-600">Your account is signed in, but some profile information is still loading.</p>}
          </div>

          <div className="relative min-h-[320px] border-t bg-muted/15 p-5 lg:border-l lg:border-t-0 sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.10),transparent_55%)]" />
            <div className="relative mx-auto flex h-full max-w-xl flex-col justify-center">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">A practice environment</p>
                  <p className="text-xs text-muted-foreground">See the task. Open the machine. Do the work.</p>
                </div>
                <Badge variant="outline">Preview</Badge>
              </div>
              <div className="relative rounded-2xl border bg-background/85 p-5 shadow-lg backdrop-blur">
                <div className="absolute left-[28%] right-[28%] top-1/2 h-px bg-border" />
                <div className="relative grid grid-cols-3 items-center gap-3">
                  <div className="rounded-xl border bg-card p-3 text-center shadow-sm">
                    <Monitor className="mx-auto h-6 w-6 text-primary" />
                    <p className="mt-2 text-xs font-semibold">Your machine</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Ready to use</p>
                  </div>
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-center shadow-sm">
                    <Network className="mx-auto h-6 w-6 text-primary" />
                    <p className="mt-2 text-xs font-semibold">Your lab</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Guided task</p>
                  </div>
                  <div className="rounded-xl border bg-card p-3 text-center shadow-sm">
                    <Server className="mx-auto h-6 w-6 text-primary" />
                    <p className="mt-2 text-xs font-semibold">Target</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Prepared for you</p>
                  </div>
                </div>
                <p className="mt-4 text-center text-[10px] leading-4 text-muted-foreground">Real resources are created only after you deliberately start an approved lab.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {hasContinuation && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Continue where you left off</h2>
              <p className="text-sm text-muted-foreground">Return directly to active work instead of navigating through setup again.</p>
            </div>
            {progress && progress.activity.streakDays > 0 && <Badge variant="outline" className="gap-1.5"><Flame className="h-3.5 w-3.5" /> {progress.activity.streakDays} day streak</Badge>}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {activeCourse && (
              <Link href="/academy" className="group">
                <Card className="h-full transition hover:border-primary/30 hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div><CardDescription>AI Academy</CardDescription><CardTitle className="mt-1 text-lg">{activeCourse.title}</CardTitle></div>
                      <Badge>{activeCourse.score}%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{activeCourse.completedLessons}/{activeCourse.totalLessons} lessons completed</p>
                    <span className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-primary">Continue learning <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
                  </CardHeader>
                </Card>
              </Link>
            )}
            {activeLab && (
              <Link href="/labs" className="group">
                <Card className="h-full transition hover:border-primary/30 hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div><CardDescription>Cyber Lab</CardDescription><CardTitle className="mt-1 text-lg">{activeLab.name}</CardTitle></div>
                      <Badge variant={activeLab.status === 'running' ? 'default' : 'outline'} className="capitalize">{activeLab.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Your existing lab state is waiting for you.</p>
                    <span className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-primary">Open lab <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
                  </CardHeader>
                </Card>
              </Link>
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Choose an outcome</h2>
          <p className="text-sm text-muted-foreground">You do not need to understand OXSIG terminology before you begin.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {intents.map(({ href, title, description, action, icon: Icon }, index) => (
            <Link key={`${href}-${index}`} href={href} className="group">
              <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                <CardHeader className="space-y-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                  <div>
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription className="mt-2 leading-6">{description}</CardDescription>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">{action} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-start gap-4 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"><BookOpen className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="font-semibold">Explain it on a Board</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Draw, narrate and share an explanation when a visual model is easier than another paragraph.</p><Link href="/collab/storyboards" className="mt-2 inline-flex text-xs font-semibold text-primary">Open Boards →</Link></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-4 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"><LibraryBig className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="font-semibold">Keep what was useful</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Save commands, concepts and procedures in Vault so the work remains useful after the lab ends.</p><Link href="/vault" className="mt-2 inline-flex text-xs font-semibold text-primary">Open Vault →</Link></div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
