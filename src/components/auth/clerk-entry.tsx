'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Bot,
  Boxes,
  Check,
  Crosshair,
  FileCheck2,
  LibraryBig,
  MessageCircle,
  PanelsTopLeft,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Swords,
  Terminal,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import styles from './landing.module.css';

const journey = [
  { name: 'Choose', sub: 'Operation', icon: Crosshair, color: '#fb7185' },
  { name: 'Run', sub: 'Cyber Lab', icon: Terminal, color: '#22d3ee' },
  { name: 'Coordinate', sub: 'WarRoom', icon: Swords, color: '#f87171' },
  { name: 'Prove', sub: 'Evidence', icon: FileCheck2, color: '#4ade80' },
  { name: 'Retain', sub: 'Vault', icon: LibraryBig, color: '#fbbf24' },
] as const;

const capabilities = [
  {
    title: 'Operations + WarRoom',
    note: 'Scenario → mission briefing → solo or team execution.',
    icon: Crosshair,
    color: '#fb7185',
  },
  {
    title: 'Cyber Lab + AI',
    note: 'Real terminal/desktop surfaces with lab-aware guidance.',
    icon: Terminal,
    color: '#22d3ee',
  },
  {
    title: 'Live + Collaborate',
    note: 'People, resources, roles, presence and authorized control.',
    icon: RadioTower,
    color: '#4ade80',
  },
  {
    title: 'Boards + Vault + Resources',
    note: 'Explain visually, preserve knowledge, manage what you own.',
    icon: BookOpen,
    color: '#a78bfa',
  },
] as const;

const surfaces = [
  { label: 'Operations', icon: Crosshair, color: '#fb7185' },
  { label: 'WarRoom', icon: Swords, color: '#f87171' },
  { label: 'Cyber Lab', icon: Terminal, color: '#22d3ee' },
  { label: 'Live', icon: RadioTower, color: '#4ade80' },
  { label: 'Collaborate', icon: MessageCircle, color: '#c084fc' },
  { label: 'Boards', icon: BookOpen, color: '#fb923c' },
  { label: 'Vault', icon: LibraryBig, color: '#fbbf24' },
  { label: 'Resources', icon: Boxes, color: '#60a5fa' },
] as const;

function customColor(name: string, value: string): CSSProperties {
  return { [name]: value } as CSSProperties;
}

export default function ClerkEntry() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label="Oxsig home">
          <span className={styles.brandMark}><PanelsTopLeft className="h-4 w-4" aria-hidden="true" /></span>
          <span>OXSIG</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="text-slate-300 hover:bg-white/[0.06] hover:text-white"><Link href="/sign-in">Log in</Link></Button>
          <Button asChild size="sm" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link href="/sign-up">Sign up</Link></Button>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}><Sparkles className="h-3.5 w-3.5" /> Cyber operations workspace</div>
          <h1 className={styles.heroTitle}>
            Build. Operate. <span className={styles.heroTitleAccent}>Prove.</span>
          </h1>
          <p className={styles.heroCopy}>
            One workspace for cyber missions, real labs, team execution, visual reasoning and evidence-backed progress.
          </p>
          <div className={styles.actions}>
            <Button asChild size="lg" className="h-11 bg-cyan-400 px-5 text-slate-950 hover:bg-cyan-300">
              <Link href="/sign-up">Enter OXSIG <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 border-white/15 bg-white/[0.03] px-5 text-slate-100 hover:bg-white/[0.08] hover:text-white">
              <Link href="/home?guest=1">Explore as guest</Link>
            </Button>
          </div>
          <div className={styles.trust}>
            <span><Check className="h-3.5 w-3.5 text-emerald-400" /> Explore before signup</span>
            <span><ShieldCheck className="h-3.5 w-3.5 text-cyan-300" /> Sign in when you need persistence</span>
          </div>
        </div>

        <div className={styles.mapShell} aria-label="OXSIG capability flow preview">
          <div className={styles.mapTop}>
            <span className={styles.liveDot} aria-hidden="true" />
            OXSIG // CAPABILITY MAP
            <span className="ml-auto text-emerald-300">SYSTEM READY</span>
          </div>
          <div className={styles.mapBody}>
            <div className={styles.journey}>
              {journey.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.name} className={styles.journeyStep} style={customColor('--step-color', step.color)}>
                    <div className="flex items-start justify-between gap-2">
                      <span className={styles.stepIcon}><Icon className="h-3.5 w-3.5" /></span>
                      <span className={styles.stepIndex}>0{index + 1}</span>
                    </div>
                    <div><span className={styles.stepName}>{step.name}</span><span className={styles.stepSub}>{step.sub}</span></div>
                  </div>
                );
              })}
            </div>

            <div className={styles.surfaceGrid}>
              <div className={styles.terminal}>
                <div className={styles.panelBar}>
                  <Terminal className="h-3.5 w-3.5 text-cyan-300" />
                  <strong>operator@lab</strong>
                  <span className="ml-auto text-emerald-300">● connected</span>
                </div>
                <div className={styles.terminalLines}>
                  <div><span className={styles.prompt}>oxsig&gt;</span> nmap -sV 10.0.0.5</div>
                  <div className={styles.dim}>22/tcp open ssh</div>
                  <div className={styles.dim}>80/tcp open http</div>
                  <div><span className={styles.success}>✓ evidence captured</span></div>
                  <div><span className={styles.prompt}>oxsig&gt;</span> <span className="motion-safe:animate-pulse">_</span></div>
                </div>
              </div>

              <div className={styles.teamPanel}>
                <div className={styles.teamHeader}>
                  <span className="flex items-center gap-1.5 text-slate-200"><UsersRound className="h-3.5 w-3.5 text-red-300" /> TEAM GRID</span>
                  <span>4 ONLINE</span>
                </div>
                <div className={styles.operators}>
                  {['P1 // TERMINAL', 'P2 // DESKTOP', 'P3 // TERMINAL', 'P4 // OBSERVE'].map((label, index) => (
                    <div key={label} className={styles.operator}>
                      <div className={styles.operatorTop}><span>{label}</span><span className="text-emerald-300">●</span></div>
                      <div className={styles.operatorName}>{index === 0 ? 'Lead operator' : `Station ${index + 1}`}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.evidenceRail}>
              <span><FileCheck2 className="h-3 w-3" /> mission evidence</span>
              <span><Bot className="h-3 w-3" /> contextual AI</span>
              <span><BookOpen className="h-3 w-3" /> visual boards</span>
              <span><LibraryBig className="h-3 w-3" /> reusable knowledge</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.story}>
        <div className={styles.storyHead}>
          <div>
            <p className={styles.sectionEyebrow}>One system // distinct workspaces</p>
            <h2 className={styles.storyTitle}>See the workflow before reading about it.</h2>
          </div>
          <p className={styles.storyHint}>Every surface has a job, a visual identity and a handoff to the next step.</p>
        </div>

        <div className={styles.capabilityGrid}>
          {capabilities.map((capability) => {
            const Icon = capability.icon;
            return (
              <article key={capability.title} className={styles.capability} style={customColor('--cap-color', capability.color)}>
                <span className={styles.capIcon}><Icon className="h-4 w-4" /></span>
                <h3>{capability.title}</h3>
                <p>{capability.note}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2" aria-label="OXSIG workspaces">
          {surfaces.map((surface) => {
            const Icon = surface.icon;
            return (
              <span key={surface.label} className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-2.5 text-xs font-medium text-slate-300">
                <Icon className="h-3.5 w-3.5" style={{ color: surface.color }} />{surface.label}
              </span>
            );
          })}
        </div>
      </section>

      <section className={styles.footerCta}>
        <div>
          <strong>Choose a mission. Build the environment. Keep the proof.</strong>
          <p>Guest mode for exploration; accounts unlock persistence and protected actions.</p>
        </div>
        <div className="flex gap-2 md:ml-auto">
          <Button asChild variant="outline" size="sm" className="border-white/15 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08] hover:text-white"><Link href="/home?guest=1">Explore</Link></Button>
          <Button asChild size="sm" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Link href="/sign-up">Create account</Link></Button>
        </div>
      </section>
    </main>
  );
}
