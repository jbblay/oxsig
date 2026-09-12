import Link from 'next/link';
import { ChevronDown, Crosshair, FileCheck2, ShieldCheck, Swords, UsersRound } from 'lucide-react';
import { OperationLaunchButton } from '@/components/operations/OperationLaunchButton';
import { TopologyNodeIcon } from '@/components/operations/OperationVisuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import WarRoomWorkspace from '@/components/warroom/WarRoomWorkspace';
import { getOperation, operationSupportsWarRoomRuntime, operations } from '@/lib/operations/catalog';
import styles from './cyber-room.module.css';

type SearchParams = Promise<{ operation?: string; run?: string; workspace?: string }>;

const warRoomReadyOperations = operations.filter(operationSupportsWarRoomRuntime);

export default async function WarRoomPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requested = getOperation(params.operation || '');
  const selected = requested && operationSupportsWarRoomRuntime(requested) ? requested : warRoomReadyOperations[0];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/20 bg-slate-950 px-3 py-2.5 text-slate-100">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-50 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <Swords className="h-4 w-4 shrink-0 text-red-300" />
          <h1 className="font-mono text-sm font-bold uppercase tracking-[0.14em] text-white sm:text-base">Cyber Room</h1>
          <Badge variant="outline" className="hidden h-6 border-white/15 bg-white/5 text-[10px] font-semibold text-slate-200 sm:inline-flex">2–4 operators</Badge>
        </div>
        <Button asChild size="sm" variant="outline" className="h-8 border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white">
          <Link href="/operations">Operations</Link>
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-8 text-slate-200 hover:bg-white/10 hover:text-white">
          <Link href="/live"><UsersRound className="mr-2 h-4 w-4" />Live Workspace</Link>
        </Button>
      </header>

      {params.run ? (
        <WarRoomWorkspace key={params.run} operation={selected} runId={params.run} initialWorkspaceId={params.workspace} />
      ) : (
        <section className={styles.shell} aria-label="Cyber Room mission briefing">
          <div className="relative z-10 flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/25 px-4 py-3">
            <span className={styles.liveDot} aria-hidden="true" />
            <Crosshair className="h-4 w-4 text-red-300" />
            <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-red-200">Mission ready</span>
            <span className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Environment standby</span>
          </div>

          <div className="relative z-10 grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:p-5">
            <main className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/25">
              <div className="p-5 sm:p-7">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Operation</p>
                <h2 className="mt-2 font-mono text-3xl font-black uppercase leading-[0.95] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
                  {selected.codename}
                </h2>
                <p className="mt-3 font-mono text-sm font-semibold uppercase tracking-[0.08em] text-slate-300">{selected.name}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-red-400/30 bg-red-950/20 text-xs font-semibold text-red-200">{selected.difficulty}</Badge>
                  <Badge variant="outline" className="border-emerald-400/30 bg-emerald-950/20 text-xs font-semibold text-emerald-200">WarRoom ready</Badge>
                  <Badge variant="outline" className="border-sky-400/30 bg-sky-950/20 text-xs font-semibold text-sky-200">2–4 operators</Badge>
                </div>

                <div className="mt-6 border-l-2 border-red-400 bg-red-950/10 px-4 py-3">
                  <p className="text-sm font-medium leading-6 text-slate-100 sm:text-base sm:leading-7">{selected.summary}</p>
                </div>
              </div>

              <section className="border-t border-white/10 bg-black/20 p-4 sm:p-5" aria-labelledby="mission-machines-title">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h3 id="mission-machines-title" className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-white">Mission machines</h3>
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">Loaded with the operation</span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {selected.topologyNodes.map((node, index) => (
                    <div key={`${node.label}:${index}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/30 text-cyan-300">
                        <TopologyNodeIcon kind={node.kind} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{node.label}</p>
                        <p className="mt-0.5 truncate text-xs font-medium text-slate-400">{node.platform || 'Mission runtime'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="border-t border-white/10 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="mr-auto">
                    <p className="text-sm font-semibold text-white">Enter the environment and start operating.</p>
                    <p className="mt-1 text-xs font-medium text-slate-400">Machine sessions stay available as you move between them.</p>
                  </div>
                  <div className="min-w-52">
                    <OperationLaunchButton slug={selected.slug} mode="warroom" label="Launch Cyber Room" className="w-full" />
                  </div>
                </div>
              </div>
            </main>

            <aside className="min-w-0 space-y-3" aria-label="Mission intelligence">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-slate-100">Mission intelligence</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-slate-400">Supporting detail stays here so the operating surface stays clean.</p>
                </div>

                <details className="group border-b border-white/10">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-sm font-semibold text-white">
                    <Crosshair className="h-4 w-4 text-red-300" />
                    <span className="flex-1">Objectives</span>
                    <span className="font-mono text-[10px] font-semibold text-slate-400">{selected.objectives.length}</span>
                    <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <ol className="space-y-2 px-4 pb-4">
                    {selected.objectives.map((objective, index) => (
                      <li key={objective} className="flex gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 text-sm leading-5 text-slate-200">
                        <span className="font-mono text-xs font-bold text-red-300">{String(index + 1).padStart(2, '0')}</span>
                        <span>{objective}</span>
                      </li>
                    ))}
                  </ol>
                </details>

                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-sm font-semibold text-white">
                    <FileCheck2 className="h-4 w-4 text-emerald-300" />
                    <span className="flex-1">Evidence package</span>
                    <span className="font-mono text-[10px] font-semibold text-slate-400">{selected.evidence.length}</span>
                    <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="space-y-2 px-4 pb-4">
                    {selected.evidence.map((item) => (
                      <li key={item} className="flex gap-2 text-sm leading-5 text-slate-300">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>

              <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-4">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-red-200">Operator rule</p>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-200">Mission first. Machines second. Supporting intelligence only when you ask for it.</p>
              </div>
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}
