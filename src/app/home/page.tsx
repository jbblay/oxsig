'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, Box, GraduationCap, LibraryBig, RadioTower, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/use-auth';

const primaryWorkflows = [
  {
    href: '/academy',
    title: 'Learn with AI Academy',
    description: 'Build a structured roadmap, learn visually, ask questions, predict outcomes and move into real lab practice.',
    eyebrow: 'Learn',
    icon: GraduationCap,
  },
  {
    href: '/labs',
    title: 'Practice in Cyber Lab',
    description: 'Design a topology, launch an owner-controlled cloud lab, use the terminal or desktop and collect execution evidence.',
    eyebrow: 'Practice',
    icon: Box,
  },
  {
    href: '/live',
    title: 'Work together live',
    description: 'Bring participants and owner-owned resources into one session, then grant explicit time-bounded machine control when needed.',
    eyebrow: 'Live',
    icon: RadioTower,
  },
];

const supportingWorkspaces = [
  { href: '/collab', title: 'Collaboration', description: 'Discuss, share resources and move a session toward practice.', icon: Users },
  { href: '/collab/storyboards', title: 'Boards', description: 'Draw, record explanations, replay and share lessons.', icon: BookOpen },
  { href: '/vault', title: 'Vault', description: 'Capture commands, procedures, concepts, scripts and playbooks as reusable knowledge.', icon: LibraryBig },
];

export default function HomePage() {
  const { user, isAuthenticated, profileError } = useAuth();
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-purple-500/10 p-6 shadow-sm sm:p-8">
        <div className="relative max-w-3xl space-y-3">
          <Badge variant="secondary">Learning → practice → evidence</Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {isAuthenticated ? `Welcome, ${user?.displayName || user?.email || 'back'}` : 'Explore Oxsig'}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Start with a mental model, prove it in a real lab, work through it with other people, and keep the useful knowledge for the next task.
          </p>
          {profileError && <p className="text-sm text-amber-600">Your sign-in session is active, but your Oxsig profile is still loading.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Start or continue</h2>
          <p className="text-sm text-muted-foreground">The three core paths through Oxsig.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {primaryWorkflows.map(({ href, title, description, eyebrow, icon: Icon }) => (
            <Link key={href} href={href} className="group">
              <Card className="h-full transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                    <Badge variant="outline">{eyebrow}</Badge>
                  </div>
                  <div>
                    <CardTitle className="text-lg">{title}</CardTitle>
                    <CardDescription className="mt-2 leading-6">{description}</CardDescription>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Explain, share and reuse</h2>
          <p className="text-sm text-muted-foreground">Supporting workspaces that keep the learning loop connected.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {supportingWorkspaces.map(({ href, title, description, icon: Icon }) => (
            <Link key={href} href={href} className="group">
              <Card className="h-full transition-colors hover:bg-muted/30">
                <CardHeader>
                  <Icon className="mb-2 h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription className="leading-5">{description}</CardDescription>
                  <span className="pt-2 text-xs font-medium text-muted-foreground group-hover:text-foreground">Open workspace →</span>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
