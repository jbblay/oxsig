'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Check,
  LibraryBig,
  MessageCircle,
  PanelsTopLeft,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const workspaces = [
  { label: 'Cyber Lab', icon: Terminal, tone: 'text-cyan-500 bg-cyan-500/10' },
  { label: 'Live', icon: RadioTower, tone: 'text-sky-500 bg-sky-500/10' },
  { label: 'Collaboration', icon: MessageCircle, tone: 'text-blue-500 bg-blue-500/10' },
  { label: 'Boards', icon: BookOpen, tone: 'text-orange-500 bg-orange-500/10' },
  { label: 'Vault', icon: LibraryBig, tone: 'text-violet-500 bg-violet-500/10' },
  { label: 'Resources', icon: Boxes, tone: 'text-emerald-500 bg-emerald-500/10' },
] as const;

export default function ClerkEntry() {
  return (
    <main className="min-h-svh overflow-hidden bg-background text-foreground">
      <header className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="Oxsig home">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <PanelsTopLeft className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>Oxsig</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link href="/sign-in">Log in</Link></Button>
          <Button asChild size="sm"><Link href="/sign-up">Sign up</Link></Button>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 pb-12 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,.82fr)_minmax(520px,1.18fr)] lg:items-center lg:gap-14 lg:px-8 lg:pb-20 lg:pt-20">
        <div className="max-w-xl">
          <div className="mb-5 inline-flex h-8 items-center gap-2 rounded-full border bg-card/70 px-3 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Technical cloud workspace
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl lg:text-[3.5rem] lg:leading-[1.03]">
            Build, run, collaborate, and keep the evidence.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
            One workspace for cloud labs, live technical sessions, collaboration, visual boards, and reusable knowledge.
          </p>

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
            <Button asChild size="lg" className="h-11 px-5">
              <Link href="/sign-up">Create account <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-5">
              <Link href="/home?guest=1">Try as guest</Link>
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Explore before signing up</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-cyan-500" /> Sign in when you want to save work</span>
          </div>
        </div>

        <div className="relative lg:pl-2">
          <div aria-hidden="true" className="absolute -inset-10 -z-10 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.09),transparent_64%)] blur-2xl" />
          <div className="overflow-hidden rounded-2xl border bg-card/88 shadow-2xl shadow-black/10 backdrop-blur-xl">
            <div className="flex h-12 items-center border-b px-4">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
              </div>
              <span className="ml-4 text-xs font-medium text-muted-foreground">Workspace</span>
              <span className="ml-auto rounded-md border px-2 py-1 text-[10px] text-muted-foreground">Dashboard</span>
            </div>

            <div className="grid gap-3 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {workspaces.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex min-h-16 items-center gap-2.5 rounded-lg border bg-background/65 p-2.5 shadow-sm">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${item.tone}`}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 truncate text-xs font-medium">{item.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 font-mono text-[11px] text-slate-300 shadow-inner">
                <div className="flex items-center gap-2 text-slate-500">
                  <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                  <span>lab-terminal</span>
                  <span className="ml-auto inline-flex items-center gap-1.5 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" /> running</span>
                </div>
                <div className="mt-3 whitespace-nowrap"><span className="text-cyan-400">oxsig&gt;</span> nmap -sV 10.0.0.5</div>
                <div className="mt-1 text-slate-500">22/tcp open ssh · 80/tcp open http</div>
                <div className="mt-1"><span className="text-cyan-400">oxsig&gt;</span> <span className="motion-safe:animate-pulse">_</span></div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border bg-background/60 p-2"><p className="text-sm font-semibold">Build</p><p className="text-[10px] text-muted-foreground">Topologies</p></div>
                <div className="rounded-lg border bg-background/60 p-2"><p className="text-sm font-semibold">Run</p><p className="text-[10px] text-muted-foreground">Cloud labs</p></div>
                <div className="rounded-lg border bg-background/60 p-2"><p className="text-sm font-semibold">Save</p><p className="text-[10px] text-muted-foreground">Evidence</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/20">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-7 text-sm sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div><p className="font-medium">Ready to work?</p><p className="mt-0.5 text-xs text-muted-foreground">Start as a guest or create an account for persistence and protected actions.</p></div>
          <div className="flex gap-2 sm:ml-auto">
            <Button asChild variant="outline" size="sm"><Link href="/home?guest=1">Try now</Link></Button>
            <Button asChild size="sm"><Link href="/sign-up">Sign up</Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
}
