'use client';

import Link from 'next/link';
import { ArrowRight, Cloud, Code2, Compass, Cpu, GraduationCap, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const careers = [
  { id: 'devops', title: 'DevOps & Cloud', description: 'Linux, networking, Docker and Kubernetes', icon: Cloud, live: true },
  { id: 'cybersecurity', title: 'Cybersecurity', description: 'Network defense, traffic analysis and investigations', icon: Shield, live: false },
  { id: 'systems', title: 'System Administration', description: 'Linux, Windows Server and Active Directory', icon: Cpu, live: false },
  { id: 'programming', title: 'Programming & Automation', description: 'Python, scripting and automation', icon: Code2, live: false },
] as const;

export default function AcademyTrackExplorer() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="rounded-2xl border bg-gradient-to-br from-blue-500/10 via-background to-emerald-500/10 p-5 sm:p-8">
        <Badge variant="outline"><Compass className="mr-1 h-3 w-3" /> OXSIG Academy</Badge>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Choose your engineering path</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Pick a career, explore its connected skill roadmap, and enter a real practical workspace when a subject is ready. You can learn from any source and practice here.</p>
        <p className="mt-2 text-xs text-muted-foreground">Docker is the first live learning workspace. Other skill modules show an honest preview of what is planned.</p>
      </header>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Career roadmaps</h2>
          <Badge variant="secondary">4 paths</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2" aria-label="Career worlds">
          {careers.map(item => {
            const Icon = item.icon;
            return (
              <Link key={item.id} href={'/academy/learn/' + item.id} className="group flex min-h-[184px] flex-col justify-between rounded-2xl border bg-card p-5 transition hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-xl border bg-primary/5 p-3"><Icon className="h-7 w-7 text-primary" /></span>
                  <Badge variant={item.live ? 'default' : 'outline'}>{item.live ? 'Docker available' : 'Roadmap preview'}</Badge>
                </div>
                <div className="mt-5">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">Open career roadmap <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold"><GraduationCap className="h-5 w-5" /> Advanced Academy and previous achievements</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your existing real-world missions, mentor activities and learning records remain accessible. The new skill map does not replace past progress.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href="/academy/engineering-world">Enter Engineering World</Link></Button>
          <Button variant="outline" asChild><Link href="/academy/missions">Open Mission Control</Link></Button>
          <Button variant="ghost" asChild><Link href="/academy/transcript">Past skill records</Link></Button>
        </div>
      </section>
    </main>
  );
}
