import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock3,
  Crosshair,
  FileCheck2,
  ShieldCheck,
  Swords,
  UsersRound,
} from 'lucide-react';
import { OperationLaunchButton } from '@/components/operations/OperationLaunchButton';
import { OperationRunRecovery } from '@/components/operations/OperationRunRecovery';
import { OperationIcon, TopologyNodeIcon } from '@/components/operations/OperationVisuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getOperationLearningFocus, type OperationLearningFocus } from '@/lib/learning/operation-focus';
import {
  getOperation,
  operationHasAutomatedRuntime,
  operationSupportsWarRoomRuntime,
  operations,
  type Operation,
  type OperationTopologyNode,
} from '@/lib/operations/catalog';
import cyberStyles from '../warroom/cyber-room.module.css';

type SearchParams = Promise<{ operation?: string; capability?: string }>;

function systemLabel(node: OperationTopologyNode) {
  const platform = node.platform?.toLowerCase() || '';
  if (platform.includes('windows server')) return 'Windows Server';
  if (platform.includes('windows')) return 'Windows';
  if (platform.includes('kali')) return 'Kali Linux';
  if (platform.includes('ubuntu')) return 'Ubuntu';
  if (platform.includes('linux')) return 'Linux';
  if (platform.includes('aws')) return 'AWS';
  if (platform.includes('http')) return 'Web service';
  if (platform.includes('disk')) return 'Disk image';
  if (node.kind === 'operator') return 'Operator';
  if (node.kind === 'workstation') return 'Workstation';
  if (node.kind === 'server') return 'Server';
  if (node.kind === 'service') return 'Service';
  if (node.kind === 'evidence') return 'Evidence';
  return 'Mission runtime';
}

export default async function OperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ isAuthenticated }, params] = await Promise.all([auth(), searchParams]);
  const selected = params.operation ? getOperation(params.operation) : null;
  const learningFocus = selected ? getOperationLearningFocus(selected.slug, params.capability) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/20 bg-slate-950 px-3 py-2.5 text-slate-100">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-50 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <Swords className="h-4 w-4 shrink-0 text-red-300" />
          <h1 className="font-mono text-sm font-bold uppercase tracking-[0.14em] text-white sm:text-base">Operations</h1>
          <Badge variant="outline" className="hidden h-6 border-white/15 bg-white/5 text-[10px] font-semibold text-slate-200 sm:inline-flex">Mission catalog</Badge>
        </div>
        <Button asChild size="sm" variant="outline" className="h-8 border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 hover:text-white">
          <Link href="/warroom"><Swords className="mr-2 h-4 w-4" />{isAuthenticated ? 'Cyber Room' : 'Preview Cyber Room'}</Link>
        </Button>
      </header>

      {!selected ? (
        <OperationCatalog />
      ) : (
        <OperationBriefing operation={selected} learningFocus={learningFocus} isAuthenticated={isAuthenticated} />
      )}
    </div>
  );
}

function OperationCatalog() {
  return (
    <>
      <OperationRunRecovery />

      <section className={cyberStyles.shell} aria-label="Operations mission catalog">
        <div className="relative z-10 flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/25 px-4 py-3">
          <span className={cyberStyles.liveDot} aria-hidden="true" />
          <Crosshair className="h-4 w-4 text-red-300" />
          <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-red-200">Mission catalog</span>
          <span className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-300">{operations.length} operations available</span>
        </div>

        <div className="relative z-10 p-4 sm:p-5">
          <div className="mb-4 max-w-3xl">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Select operation</p>
            <h2 className="mt-2 font-mono text-2xl font-black uppercase tracking-[-0.035em] text-white sm:text-3xl">Choose the mission. Then enter the environment.</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-400">Every operation uses the same mission-first workspace language as the Cyber Room: clear objective, visible machines, then supporting intelligence.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {operations.map((operation) => {
              const ready = operationHasAutomatedRuntime(operation);
              return (
                <article key={operation.slug} className="group overflow-hidden rounded-2xl border border-white/10 bg-black/25 transition hover:-translate-y-0.5 hover:border-red-400/35 hover:bg-black/35 motion-reduce:transform-none">
                  <Link href={`/operations?operation=${encodeURIComponent(operation.slug)}`} className="flex h-full min-h-72 flex-col p-4 sm:p-5" aria-label={`Open briefing for ${operation.codename}`}>
                    <div className="flex items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-cyan-300">
                        <OperationIcon icon={operation.icon} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">{operation.domain}</p>
                        <h3 className="mt-1 font-mono text-xl font-black uppercase leading-tight tracking-[-0.025em] text-white sm:text-2xl">{operation.codename}</h3>
                        <p className="mt-1 text-sm font-medium text-slate-400">{operation.name}</p>
                      </div>
                      <Badge variant="outline" className={ready ? 'border-emerald-400/30 bg-emerald-950/20 text-[10px] font-semibold text-emerald-200' : 'border-white/15 bg-white/5 text-[10px] font-semibold text-slate-300'}>
                        {ready ? 'Runtime ready' : 'Planned'}
                      </Badge>
                    </div>

                    <p className="mt-4 text-sm font-medium leading-6 text-slate-300">{operation.summary}</p>

                    <div className="mt-4 border-t border-white/10 pt-3">
                      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Mission machines</p>
                      <div className="flex flex-wrap gap-2">
                        {operation.topologyNodes.slice(0, 3).map((node, index) => (
                          <span key={`${node.label}:${index}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-1.5 text-xs font-semibold text-slate-300" title={node.label}>
                            <TopologyNodeIcon kind={node.kind} className="h-3.5 w-3.5 text-cyan-300" />
                            {systemLabel(node)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-white/10 pt-4 text-xs font-semibold text-slate-400">
                      <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{operation.estimatedMinutes} min</span>
                      <span className="inline-flex items-center gap-1.5"><UsersRound className="h-3.5 w-3.5" />{operation.players}</span>
                      <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />{operation.difficulty}</span>
                      <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-red-200">Open mission <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function OperationBriefing({ operation, learningFocus, isAuthenticated }: { operation: Operation; learningFocus: OperationLearningFocus | null; isAuthenticated: boolean }) {
  const ready = operationHasAutomatedRuntime(operation);
  const teamRelevant = operationSupportsWarRoomRuntime(operation);
  const objectives = learningFocus?.objectives || operation.objectives;
  const evidence = learningFocus?.evidence || operation.evidence;
  const backHref = learningFocus && isAuthenticated ? '/academy/paths' : '/operations';
  const backLabel = learningFocus && isAuthenticated ? 'Learning paths' : 'All operations';
  const summary = learningFocus ? learningFocus.practiceLabel : operation.summary;

  return (
    <section className={cyberStyles.shell} aria-label={`${operation.codename} mission briefing`}>
      <div className="relative z-10 flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/25 px-4 py-3">
        <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-slate-300 hover:bg-white/10 hover:text-white">
          <Link href={backHref}><ArrowLeft className="mr-1.5 h-4 w-4" />{backLabel}</Link>
        </Button>
        <span className={cyberStyles.liveDot} aria-hidden="true" />
        <Crosshair className="h-4 w-4 text-red-300" />
        <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-red-200">Mission ready</span>
        <span className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-300">{ready ? 'Environment ready' : 'Scenario ready · runtime planned'}</span>
      </div>

      <div className="relative z-10 grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:p-5">
        <main className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/25">
          <div className="p-5 sm:p-7">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">{learningFocus ? 'Capability practice' : 'Operation'}</p>
            <h2 className="mt-2 font-mono text-3xl font-black uppercase leading-[0.95] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">{operation.codename}</h2>
            <p className="mt-3 font-mono text-sm font-semibold uppercase tracking-[0.08em] text-slate-300">{learningFocus ? learningFocus.capabilityTitle : operation.name}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-red-400/30 bg-red-950/20 text-xs font-semibold text-red-200">{operation.difficulty}</Badge>
              <Badge variant="outline" className={ready ? 'border-emerald-400/30 bg-emerald-950/20 text-xs font-semibold text-emerald-200' : 'border-white/15 bg-white/5 text-xs font-semibold text-slate-300'}>{ready ? 'Runtime ready' : 'Runtime planned'}</Badge>
              <Badge variant="outline" className="border-sky-400/30 bg-sky-950/20 text-xs font-semibold text-sky-200">{operation.players} operators</Badge>
              {learningFocus ? <Badge variant="outline" className="border-violet-400/30 bg-violet-950/20 text-xs font-semibold text-violet-200">Academy linked</Badge> : null}
            </div>

            <div className="mt-6 border-l-2 border-red-400 bg-red-950/10 px-4 py-3">
              <p className="text-sm font-medium leading-6 text-slate-100 sm:text-base sm:leading-7">{summary}</p>
            </div>
          </div>

          <section className="border-t border-white/10 bg-black/20 p-4 sm:p-5" aria-labelledby="operation-machines-title">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 id="operation-machines-title" className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-white">Mission environment</h3>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">{operation.topologyNodes.length} systems loaded</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {operation.topologyNodes.map((node, index) => (
                <div key={`${node.label}:${index}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/30 text-cyan-300">
                    <TopologyNodeIcon kind={node.kind} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{node.label}</p>
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-400">{node.platform || systemLabel(node)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-white/10 p-4 sm:p-5">
            {ready ? (
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="mr-auto">
                  <p className="text-sm font-semibold text-white">Enter the environment and start operating.</p>
                  <p className="mt-1 text-xs font-medium text-slate-400">The mission package is loaded. Supporting intelligence stays on the right.</p>
                </div>
                <div className="flex min-w-56 flex-col gap-2 sm:flex-row">
                  <OperationLaunchButton slug={operation.slug} mode="practice" capabilityId={learningFocus?.capabilityId} label={learningFocus ? 'Start Capability Practice' : 'Start Operation'} className="w-full sm:w-auto" />
                  {teamRelevant ? <OperationLaunchButton slug={operation.slug} mode="warroom" capabilityId={learningFocus?.capabilityId} variant="outline" label="Start Team Operation" className="w-full sm:w-auto" /> : null}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-red-400/30 bg-red-950/10 p-4">
                <p className="text-sm font-semibold text-white">Mission briefing ready. Runtime connection is still planned.</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">Launch controls will activate when this operation environment is connected.</p>
              </div>
            )}
          </div>
        </main>

        <aside className="min-w-0 space-y-3" aria-label="Mission intelligence">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
            <div className="border-b border-white/10 px-4 py-3">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-slate-100">Mission intelligence</p>
              <p className="mt-1 text-xs font-medium leading-5 text-slate-400">Supporting detail stays here so the mission surface stays clean.</p>
            </div>

            <details className="group border-b border-white/10" open>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-sm font-semibold text-white">
                <Crosshair className="h-4 w-4 text-red-300" />
                <span className="flex-1">{learningFocus ? 'Capability objective' : 'Objectives'}</span>
                <span className="font-mono text-[10px] font-semibold text-slate-400">{objectives.length}</span>
                <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <ol className="space-y-2 px-4 pb-4">
                {objectives.map((objective, index) => (
                  <li key={objective} className="flex gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 text-sm leading-5 text-slate-200">
                    <span className="font-mono text-xs font-bold text-red-300">{String(index + 1).padStart(2, '0')}</span>
                    <span>{objective}</span>
                  </li>
                ))}
              </ol>
            </details>

            <details className="group border-b border-white/10">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-sm font-semibold text-white">
                <FileCheck2 className="h-4 w-4 text-emerald-300" />
                <span className="flex-1">{learningFocus ? 'Evidence target' : 'Evidence package'}</span>
                <span className="font-mono text-[10px] font-semibold text-slate-400">{evidence.length}</span>
                <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="space-y-2 px-4 pb-4">
                {evidence.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-5 text-slate-300">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </details>

            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-sm font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-amber-300" />
                <span className="flex-1">Techniques</span>
                <span className="font-mono text-[10px] font-semibold text-slate-400">{operation.tags.length}</span>
                <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="flex flex-wrap gap-2 px-4 pb-4">
                {operation.tags.map((tag) => <Badge key={tag} variant="outline" className="border-white/10 bg-white/[0.035] text-xs font-medium text-slate-300">{tag}</Badge>)}
              </div>
            </details>
          </div>

          <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-red-200">Operator rule</p>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-200">Mission first. Machines second. Supporting intelligence only when you need it.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
