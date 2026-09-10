import Link from 'next/link';
import { Activity, Crosshair, FileCheck2, Radio, ShieldCheck, Swords, UsersRound } from 'lucide-react';
import { OperationLaunchButton } from '@/components/operations/OperationLaunchButton';
import { OperationIcon, OperationTopologyPreview } from '@/components/operations/OperationVisuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import WarRoomWorkspace from '@/components/warroom/WarRoomWorkspace';
import { getOperation, operations } from '@/lib/operations/catalog';
import styles from './cyber-room.module.css';

type SearchParams = Promise<{ operation?: string; run?: string; workspace?: string }>;

const warRoomReadyOperations = operations.filter(
  (operation) => operation.slug === 'black-domain' && operation.modes.includes('warroom'),
);

export default async function WarRoomPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requested = getOperation(params.operation || '');
  const selected = requested?.slug === 'black-domain' ? requested : warRoomReadyOperations[0];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/20 bg-slate-950 px-3 py-2.5 text-slate-100">
        <div className="mr-auto flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-50 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <Swords className="h-4 w-4 text-red-300" />
          <h1 className="font-mono text-sm font-semibold uppercase tracking-[0.16em]">WarRoom</h1>
          <Badge variant="outline" className="h-5 border-white/15 bg-white/5 text-[9px] text-slate-300">2–4 operators</Badge>
        </div>
        <span className="hidden font-mono text-[9px] uppercase tracking-widest text-slate-600 sm:inline">secure collaboration channel</span>
        <Button asChild size="sm" variant="outline" className="h-8 border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"><Link href="/operations">Operations</Link></Button>
        <Button asChild size="sm" variant="ghost" className="h-8 text-slate-300 hover:bg-white/10 hover:text-white"><Link href="/live"><UsersRound className="mr-2 h-4 w-4" />Live Workspace</Link></Button>
      </div>

      {params.run ? (
        <WarRoomWorkspace key={params.run} operation={selected} runId={params.run} initialWorkspaceId={params.workspace} />
      ) : (
        <section className={styles.shell} aria-label="Cyber Room mission briefing">
          <div className={styles.topRail}>
            <span className={styles.liveDot} aria-hidden="true" />
            <Crosshair className="h-4 w-4 text-red-300" />
            <span className={styles.kicker}>Cyber Room // Mission dossier</span>
            <div className={styles.railMeta}>
              <span>Channel encrypted</span>
              <span>Standby</span>
            </div>
          </div>

          <div className={styles.body}>
            <div className={styles.hero}>
              <div className={styles.heroHeader}>
                <div>
                  <p className={styles.eyebrow}>Operation intelligence</p>
                  <h2 className={styles.title}>{selected.codename}</h2>
                  <p className={styles.subtitle}>{selected.name}</p>
                  <div className={styles.badges}>
                    <span className={styles.badgeRed}>{selected.difficulty}</span>
                    <span className={styles.badgeGreen}>WarRoom ready</span>
                    <span className={styles.badgeBlue}>2–4 operators</span>
                  </div>
                </div>

                <div className={styles.summaryBlock}>
                  {selected.summary}
                </div>
              </div>

              <div className={styles.visualPanel}>
                <div className={styles.visualLabel}>
                  <span>Tactical network</span>
                  <span>Live topology preview</span>
                </div>
                <div className={styles.visualInner}>
                  <OperationTopologyPreview nodes={selected.topologyNodes} />
                </div>
              </div>

              <div className={styles.launchZone}>
                <div className={styles.launchHint}>
                  <span>Room status <strong>Ready</strong></span>
                  <span>Mission package <strong>Loaded</strong></span>
                  <span>Operator slots <strong>2–4</strong></span>
                </div>
                <div className={styles.launchButton}>
                  <OperationLaunchButton slug={selected.slug} mode="warroom" label="Start team Operation" />
                </div>
              </div>
            </div>

            <aside className={styles.sideRail} aria-label="Mission intelligence rail">
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <Crosshair className="h-4 w-4 text-red-300" />
                  Objectives
                  <span className={styles.panelCount}>{selected.objectives.length} tracked</span>
                </div>
                <ol className={styles.objectiveList}>
                  {selected.objectives.map((objective, index) => (
                    <li key={objective} className={styles.objectiveItem}>
                      <span className={styles.objectiveIndex}>{String(index + 1).padStart(2, '0')}</span>
                      <span className={styles.itemText}>{objective}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <FileCheck2 className="h-4 w-4 text-emerald-300" />
                  Evidence package
                  <span className={styles.panelCount}>{selected.evidence.length} items</span>
                </div>
                <ul className={styles.evidenceList}>
                  {selected.evidence.map((item) => (
                    <li key={item} className={styles.evidenceItem}>
                      <span className={styles.evidenceIcon}><ShieldCheck className="h-4 w-4" /></span>
                      <span className={styles.itemText}>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className={`${styles.panel} ${styles.signalPanel}`}>
                <div className={styles.signalLine}>
                  <Radio className="h-3.5 w-3.5 text-cyan-300" />
                  Collaboration channel
                  <strong>Secure</strong>
                </div>
                <div className={styles.signalTrack} aria-hidden="true" />
                <div className={styles.signalLine}>
                  <Activity className="h-3.5 w-3.5 text-emerald-300" />
                  Environment state
                  <strong>Standby</strong>
                </div>
              </section>
            </aside>
          </div>

          <div className={styles.footerRail}>
            <strong>OPSEC</strong>
            <span>Brief first</span>
            <span>Launch second</span>
            <span>Operate inside the live WarRoom</span>
          </div>
        </section>
      )}
    </div>
  );
}
