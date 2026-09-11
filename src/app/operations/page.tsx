import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  Clock3,
  Crosshair,
  FileCheck2,
  Radio,
  Shield,
  Swords,
  UsersRound,
} from 'lucide-react';
import { OperationLaunchButton } from '@/components/operations/OperationLaunchButton';
import { OperationRunRecovery } from '@/components/operations/OperationRunRecovery';
import { OperationIcon, OperationTopologyPreview, TopologyNodeIcon } from '@/components/operations/OperationVisuals';
import { Button } from '@/components/ui/button';
import {
  getOperation,
  operationHasAutomatedRuntime,
  operationSupportsWarRoomRuntime,
  operations,
  type Operation,
  type OperationTopologyNode,
} from '@/lib/operations/catalog';
import styles from './operations.module.css';

type SearchParams = Promise<{ operation?: string }>;

const DOMAIN_THEME: Record<string, string> = {
  'Active Directory': styles.activeDirectory,
  Linux: styles.linux,
  Network: styles.network,
  Web: styles.web,
  Forensics: styles.forensics,
  Cloud: styles.cloud,
};

const DOMAIN_COLOR: Record<string, string> = {
  'Active Directory': '#8B5CF6',
  Linux: '#22C55E',
  Network: '#06B6D4',
  Web: '#F43F5E',
  Forensics: '#F59E0B',
  Cloud: '#3B82F6',
};

function systemLabel(node: OperationTopologyNode) {
  const platform = node.platform?.toLowerCase() || '';
  if (platform.includes('windows server')) return 'WIN SRV';
  if (platform.includes('windows')) return 'WIN';
  if (platform.includes('kali')) return 'KALI';
  if (platform.includes('ubuntu')) return 'UBUNTU';
  if (platform.includes('linux')) return 'LINUX';
  if (platform.includes('aws')) return 'AWS';
  if (platform.includes('http')) return 'HTTP';
  if (platform.includes('disk')) return 'IMAGE';
  if (node.kind === 'operator') return 'OPERATOR';
  if (node.kind === 'workstation') return 'HOST';
  if (node.kind === 'server') return 'SERVER';
  if (node.kind === 'service') return 'SERVICE';
  if (node.kind === 'evidence') return 'EVIDENCE';
  return 'CLOUD';
}

function StageRail({ detail = false }: { detail?: boolean }) {
  return (
    <div className={styles.stageRail} aria-label="Operation flow">
      <div className={`${styles.stage} ${styles.stageActive}`}>
        <span className={styles.stageNumber}>01</span>
        <span className={styles.stageLabel}>Select mission</span>
      </div>
      <div className={`${styles.stage} ${detail ? styles.stageActive : ''}`}>
        <span className={styles.stageNumber}>02</span>
        <span className={styles.stageLabel}>Read briefing</span>
      </div>
      <div className={styles.stage}>
        <span className={styles.stageNumber}>03</span>
        <span className={styles.stageLabel}>Start operation</span>
      </div>
    </div>
  );
}

export default async function OperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selected = params.operation ? getOperation(params.operation) : null;

  return (
    <div className={`${styles.page} mx-auto max-w-7xl space-y-4`}>
      <div className={styles.header}>
        <span className={styles.headerMark} aria-hidden="true" />
        <Swords className="h-4 w-4 text-red-300" />
        <div className={styles.headerCopy}>
          <h1 className={styles.headerTitle}>Operations</h1>
          <p className={styles.headerText}>Choose the domain. Read the mission. Enter the environment.</p>
        </div>
        <Button asChild size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white">
          <Link href="/warroom"><Swords className="mr-2 h-4 w-4" />Cyber Room</Link>
        </Button>
      </div>

      <StageRail detail={Boolean(selected)} />

      {!selected ? (
        <>
          <OperationRunRecovery />

          <section className={styles.grid} aria-label="Operation domains">
            {operations.map((operation) => {
              const ready = operationHasAutomatedRuntime(operation);
              const theme = DOMAIN_THEME[operation.domain] || styles.web;
              return (
                <article key={operation.slug} className={`${styles.tile} ${theme}`}>
                  <Link href={`/operations?operation=${encodeURIComponent(operation.slug)}`} className={styles.tileLink} aria-label={`Open briefing for ${operation.codename}`}>
                    <div className={styles.tileTop}>
                      <span className={styles.tileIcon}>
                        <OperationIcon icon={operation.icon} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={styles.domain}>{operation.domain}</p>
                        <h2 className={styles.codename}>{operation.codename}</h2>
                        <p className={styles.name}>{operation.name}</p>
                      </div>
                      <span className="font-mono text-[8px] uppercase tracking-wider text-slate-600">{ready ? 'LIVE' : 'PLANNED'}</span>
                    </div>

                    <p className={styles.summary}>{operation.summary}</p>

                    <div className={styles.systemRail} aria-label={`${operation.codename} systems`}>
                      {operation.topologyNodes.slice(0, 3).map((node, index) => (
                        <span key={`${node.label}:${index}`} className={styles.systemChip} title={node.label}>
                          <TopologyNodeIcon kind={node.kind} />
                          {systemLabel(node)}
                        </span>
                      ))}
                    </div>

                    <div className={styles.tileFooter}>
                      <span><Clock3 />{operation.estimatedMinutes}m</span>
                      <span><UsersRound />{operation.players}</span>
                      <span><Shield />{operation.difficulty}</span>
                      <span className={styles.openCue}>Brief <ChevronRight /></span>
                    </div>
                  </Link>
                </article>
              );
            })}
          </section>

          <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-white/[0.06] bg-slate-950/60 px-3 py-2 font-mono text-[8px] uppercase tracking-wider text-slate-600">
            {Object.entries(DOMAIN_COLOR).map(([domain, color]) => (
              <span key={domain} className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                {domain} {color}
              </span>
            ))}
          </div>
        </>
      ) : (
        <OperationBriefing operation={selected} />
      )}
    </div>
  );
}

function OperationBriefing({ operation }: { operation: Operation }) {
  const ready = operationHasAutomatedRuntime(operation);
  const theme = DOMAIN_THEME[operation.domain] || styles.web;
  const teamRelevant = operationSupportsWarRoomRuntime(operation);

  return (
    <section className={`${styles.detail} ${theme}`} aria-label={`${operation.codename} briefing`}>
      <div className={styles.detailRail}>
        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-slate-400 hover:bg-white/[0.05] hover:text-white">
          <Link href="/operations"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />All operations</Link>
        </Button>
        <span className={styles.detailKicker}>{operation.domain} // Mission dossier</span>
        <span className={styles.detailState}>{ready ? 'Runtime ready' : 'Scenario ready · runtime planned'}</span>
      </div>

      <div className={styles.detailBody}>
        <div className={styles.hero}>
          <div className={styles.heroTop}>
            <div>
              <p className={styles.heroEyebrow}>Operation intelligence</p>
              <h2 className={styles.heroTitle}>{operation.codename}</h2>
              <p className={styles.heroName}>{operation.name}</p>
              <div className={styles.metaRow}>
                <span className={styles.metaBadge}>{operation.difficulty}</span>
                <span className={styles.metaBadge}>{operation.estimatedMinutes} minutes</span>
                <span className={styles.metaBadge}>{operation.players} operators</span>
                {teamRelevant ? <span className={styles.metaBadge}>Team capable</span> : null}
              </div>
            </div>
            <p className={styles.heroSummary}>{operation.summary}</p>
          </div>

          <div className={styles.topology}>
            <div className={styles.topologyHeader}>
              <span>Mission environment</span>
              <strong>{operation.topologyNodes.length} systems</strong>
            </div>
            <div className={styles.topologyInner}>
              <OperationTopologyPreview nodes={operation.topologyNodes} />
            </div>
          </div>

          {ready ? (
            <div className={styles.launchZone}>
              <div className={styles.launchStatus}>
                <span><Activity className="mr-1 inline h-3 w-3" />Environment <strong>Ready</strong></span>
                <span><Radio className="mr-1 inline h-3 w-3" />Mission package <strong>Loaded</strong></span>
              </div>
              <div className={styles.launchButtons}>
                <span className={styles.launchPrimary}>
                  <OperationLaunchButton slug={operation.slug} mode="practice" label="Start Operation" />
                </span>
                {teamRelevant ? (
                  <span className={styles.launchSecondary}>
                    <OperationLaunchButton slug={operation.slug} mode="warroom" variant="outline" label="Start Team Operation" />
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={styles.planned}>
              <strong className="text-slate-200">Stage 3 is reserved.</strong> The briefing and domain identity are ready, but automated runtime for this operation is not implemented yet. Launch controls will activate when its environment is connected.
            </div>
          )}
        </div>

        <aside className={styles.side} aria-label="Operation intelligence">
          <section className={styles.panel}>
            <div className={styles.panelTitle}>
              <Crosshair />Objectives
              <span className={styles.panelCount}>{operation.objectives.length}</span>
            </div>
            <ol className={styles.list}>
              {operation.objectives.map((objective, index) => (
                <li key={objective} className={styles.listItem}>
                  <span className={styles.index}>{String(index + 1).padStart(2, '0')}</span>
                  <span>{objective}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelTitle}>
              <FileCheck2 />Evidence
              <span className={styles.panelCount}>{operation.evidence.length}</span>
            </div>
            <ul className={styles.list}>
              {operation.evidence.map((item) => (
                <li key={item} className={styles.listItem}>
                  <span className={styles.index}>+</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelTitle}><Shield />Techniques</div>
            <div className={styles.tags}>
              {operation.tags.map((tag) => <span key={tag} className={styles.tag}>{tag}</span>)}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
