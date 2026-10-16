'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Boxes, CheckCircle2, Cloud, Code2, Compass, Cpu, GraduationCap, LockKeyhole, Network, Shield, TerminalSquare, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const worlds = [
  { id: 'devops', name: 'DevOps & Cloud', caption: 'Build, ship and restore real systems', icon: Cloud, skills: [
    { name: 'Docker', status: 'playable', icon: Boxes, href: '/academy/learn/docker', caption: 'Three interactive castles with persistent checkpoints' },
    { name: 'Linux', status: 'planned', icon: TerminalSquare, caption: 'Command-line workshops' },
    { name: 'Kubernetes', status: 'planned', icon: Network, caption: 'Workload orchestration' },
  ] },
  { id: 'cybersecurity', name: 'Cybersecurity', caption: 'Defend networks and investigate incidents', icon: Shield, skills: [
    { name: 'Network Fundamentals', status: 'planned', icon: Network, caption: 'Topology wiring, IPs and switches' },
    { name: 'Traffic Analysis', status: 'planned', icon: Shield, caption: 'Trace packets and investigate evidence' },
  ] },
  { id: 'systems', name: 'System Administration', caption: 'Understand and operate computers', icon: Cpu, skills: [
    { name: 'Hardware Basics', status: 'planned', icon: Cpu, caption: 'Assemble a virtual computer' },
    { name: 'Linux Administration', status: 'planned', icon: TerminalSquare, caption: 'Manage users, files and services' },
  ] },
  { id: 'programming', name: 'Programming & Automation', caption: 'Build tools that solve problems', icon: Code2, skills: [
    { name: 'Python', status: 'planned', icon: Code2, caption: 'Write, run and debug programs' },
    { name: 'Automation', status: 'planned', icon: Wrench, caption: 'Automate repeatable engineering tasks' },
  ] },
] as const;

type WorldId = typeof worlds[number]['id'];

export default function AcademyTrackExplorer() {
  const [selected, setSelected] = React.useState<WorldId>('devops');
  const world = worlds.find(w => w.id === selected)!;
  return (
    <main className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="rounded-2xl border bg-gradient-to-br from-blue-500/10 via-background to-emerald-500/10 p-5 sm:p-8">
        <Badge variant="outline"><Compass className="mr-1 h-3 w-3" /> OXSIG Academy · Your learning world</Badge>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Choose your engineering path</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Pick a career world, then enter an interactive skill. Configure things, test your work, and watch your verified practice checkpoints unlock the next castle. Explanations are available when you need them.</p>
        <p className="mt-2 text-xs text-muted-foreground">Docker is our first playable simulation. Other subjects shown below are planned, not live lessons.</p>
      </header>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Choose a career world</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Career worlds">
          {worlds.map(item => {
            const Icon = item.icon;
            const active = item.id === selected;
            return (
              <button type="button" key={item.id} aria-pressed={active} onClick={() => setSelected(item.id)}
                className={`rounded-xl border p-4 text-left transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active ? 'border-primary bg-primary/10' : 'bg-card'}`}>
                <div className="flex justify-between"><Icon className="h-7 w-7 text-primary" />{active && <CheckCircle2 className="h-4 w-4 text-primary" />}</div>
                <h3 className="mt-4 font-semibold">{item.name}</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.caption}</p>
              </button>
            );
          })}
        </div>
      </section>
      <section className="space-y-3" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{world.name} · Skills</h2>
            <p className="text-xs text-muted-foreground">Start with an unlocked skill; advanced skills appear as they are developed.</p>
          </div>
          <Badge variant="secondary">{world.skills.filter(s => s.status === 'playable').length} playable now</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {world.skills.map(skill => {
            const Icon = skill.icon;
            return (
              <Card key={skill.name} className={skill.status === 'playable' ? 'border-emerald-500/40' : 'opacity-70'}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Icon className="h-6 w-6 text-primary" />
                    <Badge variant="outline">{skill.status === 'playable' ? 'Start now' : 'Coming later'}</Badge>
                  </div>
                  <CardTitle className="mt-2">{skill.name}</CardTitle>
                  <CardDescription>{skill.caption}</CardDescription>
                </CardHeader>
                <CardContent>
                  {skill.status === 'playable'
                    ? <Button asChild className="w-full"><Link href={skill.href}>Enter Docker Kingdom <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                    : <div className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="h-4 w-4" /> Curriculum in development</div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold"><GraduationCap className="h-5 w-5" /> Already using the advanced Academy?</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your existing real-world missions and verified achievements stay available. The new practice simulator does not replace practical lab assessments.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href="/academy/engineering-world">Enter Engineering World</Link></Button>
          <Button variant="outline" asChild><Link href="/academy/missions">Open Mission Control</Link></Button>
          <Button variant="ghost" asChild><Link href="/academy/transcript">Past skill records</Link></Button>
        </div>
      </section>
    </main>
  );
}
