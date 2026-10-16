'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Boxes, CheckCircle2, Cloud, Code2, Cpu, LockKeyhole, Network, Shield, TerminalSquare, Wrench, X } from 'lucide-react';
import { ACADEMY_ROADMAPS, getSkillRoadmapState, type CareerId } from '@/lib/academy/roadmap-catalog';
import { Badge } from '@/components/ui/badge';

const careerIcons = { devops: Cloud, cybersecurity: Shield, systems: Cpu, programming: Code2 };
const skillIcons = { docker: Boxes, 'linux-fundamentals': TerminalSquare, networking: Network, kubernetes: Cloud, python: Code2 };

export default function AcademySkillRoadmap({ careerId }: { careerId: CareerId }) {
  const career = ACADEMY_ROADMAPS[careerId];
  const CareerIcon = careerIcons[careerId];
  const [verified, setVerified] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const [progressState, setProgressState] = React.useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (careerId !== 'devops') { setProgressState('ready'); return; }
    const controller = new AbortController();
    void fetch('/api/academy/missions', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Cannot read verified mission progress');
        const result = await response.json() as { progress?: { missionId: string; verifiedAt: string | null }[] };
        if (controller.signal.aborted) return;
        setVerified(new Set((result.progress || []).filter(item => Boolean(item.verifiedAt)).map(item => item.missionId)));
        setProgressState('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setProgressState('unavailable'); });
    return () => controller.abort();
  }, [careerId]);

  const status = (skillId: string) => getSkillRoadmapState(career, skillId, verified);
  const preview = career.skills.find(item => item.id === previewId && item.availability === 'planned');
  const liveCount = career.skills.filter(item => item.availability === 'live').length;

  return (
    <main className="mx-auto max-w-6xl space-y-5 pb-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/academy" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All career roadmaps</Link>
        <Badge variant="outline">{liveCount} practical {liveCount === 1 ? 'workspace' : 'workspaces'} ready</Badge>
      </div>
      <header className="rounded-2xl border bg-gradient-to-r from-blue-500/10 via-background to-background p-5 sm:p-7">
        <Badge variant="outline"><CareerIcon className="mr-1 h-3.5 w-3.5" /> OXSIG Academy</Badge>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-4xl">{career.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{career.subtitle} Follow the skill path below; open a ready workspace to start practicing.</p>
      </header>

      <section aria-label={career.title + ' skill roadmap'} className="academy-roadmap relative overflow-hidden rounded-3xl border border-slate-700/70 bg-[#090e1d] px-4 py-8 text-slate-100 shadow-2xl sm:px-8">
        <div className="pointer-events-none absolute -left-20 top-24 h-48 w-48 rounded-full bg-blue-700/10 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-20 bottom-24 h-56 w-56 rounded-full bg-red-600/10 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 mb-5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Your skill roadmap</h2>
            <p className="mt-1 text-xs text-slate-400">Straight ahead: preview the modules or enter a live skill.</p>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400" aria-label="Roadmap status legend">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" /> Active</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-400" /> Verified</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" /> Coming later</span>
          </div>
        </div>

        <ol className="relative z-10 flex flex-col items-center" aria-label="Ordered skills">
          {career.skills.map((skill, index) => {
            const state = status(skill.id);
            const SkillIcon = skillIcons[skill.id as keyof typeof skillIcons] || (careerId === 'cybersecurity' ? Shield : careerId === 'systems' ? Cpu : Wrench);
            const isLast = index === career.skills.length - 1;
            const circle = <span className={'academy-roadmap__node relative flex h-24 w-24 items-center justify-center rounded-full border-2 transition-transform group-hover:scale-105 group-focus-visible:scale-105 sm:h-28 sm:w-28 ' + (state === 'active' ? 'academy-roadmap__node--active border-rose-400 bg-rose-950/70 text-rose-200' : state === 'complete' ? 'academy-roadmap__node--complete border-green-400 bg-green-950/70 text-green-200' : 'border-slate-600 bg-slate-900 text-slate-400')}>
              <span className="flex flex-col items-center gap-1 text-center">
                {state === 'complete' ? <CheckCircle2 className="h-7 w-7" /> : state === 'planned' ? <LockKeyhole className="h-6 w-6" /> : <SkillIcon className="h-7 w-7" />}
                <span className="text-[10px] font-semibold uppercase tracking-widest">{String(index + 1).padStart(2, '0')}</span>
              </span>
            </span>;
            return (
              <li key={skill.id} className="flex w-full flex-col items-center">
                {skill.availability === 'live' && state !== 'locked' && skill.href
                  ? <Link href={skill.href} className="group relative flex flex-col items-center rounded-2xl p-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
                      {circle}
                      <span className="mt-3 text-base font-bold text-white">{skill.title}</span>
                      <span className="mt-1 max-w-xs text-xs leading-5 text-slate-400">{skill.summary}</span>
                      <span className={state === 'complete' ? 'mt-2 text-xs font-semibold text-green-300' : 'mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-300'}>{state === 'complete' ? 'Skill verified · Practice again' : 'Enter practical workspace'} <ArrowRight className="h-3.5 w-3.5" /></span>
                    </Link>
                  : <button type="button" disabled={state === 'locked'} onClick={() => setPreviewId(current => current === skill.id ? null : skill.id)}
                      className="group relative flex flex-col items-center rounded-2xl p-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      aria-expanded={state === 'planned' ? previewId === skill.id : undefined} aria-controls={state === 'planned' ? 'academy-planned-preview' : undefined}>
                      {circle}
                      <span className="mt-3 text-base font-semibold text-slate-200">{skill.title}</span>
                      <span className="mt-1 max-w-xs text-xs leading-5 text-slate-400">{skill.summary}</span>
                      <span className="mt-2 text-xs text-slate-400">{state === 'locked' ? 'Locked · Verify the previous skill' : 'Coming later · Preview modules'}</span>
                    </button>}
                {!isLast && <div className={'academy-roadmap__connector relative my-2 h-16 w-1.5 overflow-visible rounded-full ' + (state === 'active' ? 'academy-roadmap__connector--active bg-rose-900/70' : state === 'complete' ? 'academy-roadmap__connector--complete bg-green-500/70' : 'bg-slate-700/70')} aria-hidden="true">
                  {state === 'active' && <span className="academy-roadmap__beam absolute inset-0 rounded-full" />}
                </div>}
              </li>
            );
          })}
        </ol>
        {progressState === 'unavailable' && careerId === 'devops' && <p role="status" className="relative z-10 mt-4 text-center text-xs text-amber-200">Saved verification is temporarily unavailable. Your live Docker workspace can still be opened.</p>}
        {preview && <section id="academy-planned-preview" aria-label={preview.title + ' planned modules'} className="relative z-10 mx-auto mt-6 max-w-xl rounded-2xl border border-slate-600 bg-slate-900/90 p-4">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="text-base font-semibold">{preview.title} · Module preview</h3><p className="mt-1 text-xs text-slate-400">These are curriculum outlines, not playable lessons yet.</p></div>
            <button type="button" className="rounded-md p-1 text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400" onClick={() => setPreviewId(null)} aria-label="Close module preview"><X className="h-4 w-4" /></button>
          </div>
          <ol className="mt-3 space-y-2">{preview.modules.map((module,i) => <li key={module.id} className="flex gap-3 rounded-lg border border-slate-700 p-3 text-sm">
            <span className="font-mono text-xs text-slate-500">{String(i + 1).padStart(2, '0')}</span>
            <span><span className="block font-medium text-slate-200">{module.title}</span><span className="mt-1 block text-xs text-slate-400">{module.summary}</span></span>
          </li>)}</ol>
        </section>}
      </section>
    </main>
  );
}
