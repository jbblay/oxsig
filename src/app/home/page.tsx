'use client';

import Link from 'next/link';
import { BookOpen, Box, HardDrive, User, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/use-auth';

const workspaces = [
  { href: '/collab/storyboards', title: 'Boards', description: 'Draw, record explanations, replay, and share lessons.', icon: BookOpen },
  { href: '/collab', title: 'Collaboration', description: 'Organize the learning-to-practice workflow.', icon: Users },
  { href: '/storage', title: 'Storage', description: 'Keep files and resources available across your workspace.', icon: HardDrive },
  { href: '/labs', title: 'Cyber Lab', description: 'Launch temporary AWS practice machines.', icon: Box },
  { href: '/account', title: 'Account', description: 'Manage your Oxsig profile and identity.', icon: User },
];

export default function HomePage() {
  const { user, isAuthenticated, profileError } = useAuth();
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{isAuthenticated ? `Welcome, ${user?.displayName || user?.email || 'back'}` : 'Explore Oxsig'}</h1>
        <p className="max-w-2xl text-muted-foreground">Explain visually, keep the resources together, and move directly into practical cloud labs.</p>
        {profileError && <p className="text-sm text-amber-600">Your Clerk session is active, but the Oxsig profile service is not ready yet.</p>}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader><Icon className="mb-2 h-6 w-6" /><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
              <CardContent className="text-sm text-muted-foreground">Open workspace →</CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
