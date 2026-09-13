import styles from './warroom.module.css';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { LabOsIcon } from '@/components/labs/LabMachineNode';
import type { LabOsFamily } from '@/lib/labs/types';

type Node = { id: string; label: string; role: string; osFamily: string; status: string; computeStatus?: string; readiness?: string };
type LifecycleProgress = { phase?: string; total?: number; stopped?: number; nodeStates?: Record<string, string> } | null;

function iconFamily(value: string): LabOsFamily {
  const normalized = value.toLowerCase();
  if (normalized.includes('windows')) return 'windows';
  if (normalized.includes('kali')) return 'kali';
  if (normalized.includes('rocky')) return 'rocky';
  if (normalized.includes('amazon')) return 'amazon-linux';
  return 'ubuntu';
}

export function RuntimeProgress({
  nodes,
  paused = false,
  status,
  lifecycle = null,
}: {
  nodes: Node[];
  paused?: boolean;
  status: string;
  lifecycle?: LifecycleProgress;
}) {
  const terminal = ['failed', 'destroying', 'destroyed'].includes(status);
  const pausing = lifecycle?.phase === 'pausing';
  const pauseComplete = paused && lifecycle?.phase === 'paused';
  const ready = paused || terminal ? 0 : nodes.filter((node) => node.status === 'running').length;
  const completed = pausing || pauseComplete ? lifecycle?.stopped || 0 : ready;
  const total = Math.max(nodes.length, 1);
  const header = pausing ? 'Pausing machines' : pauseComplete ? 'Paused' : terminal ? `Environment ${status}` : 'Setting up environment';
  const countLabel = pausing || pauseComplete ? `${completed}/${nodes.length} stopped` : `${completed}/${nodes.length} ready`;

  return (
    <div className="mt-3 space-y-2" aria-label="Environment readiness">
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>{header}</span>
        <span className="font-mono">{countLabel}</span>
      </div>
      <progress
        className="h-2 w-full accent-emerald-500"
        max={total}
        value={completed}
        aria-label={pausing || pauseComplete ? 'Machines stopped' : 'Machines verified ready'}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        {nodes.map((node) => {
          const providerState = lifecycle?.nodeStates?.[node.id];
          const failed = node.status === 'failed' || status === 'failed';
          const ending = ['destroying', 'destroyed'].includes(node.status) || ['destroying', 'destroyed'].includes(status);
          const pauseDone = (pausing || pauseComplete) && providerState === 'stopped';
          const done = pausing || pauseComplete ? pauseDone : !paused && !terminal && node.status === 'running';
          const label = pausing || pauseComplete
            ? pauseDone ? 'Paused' : 'Stopping'
            : failed ? 'Failed'
              : ending ? 'Stopping'
                : done ? 'Ready'
                  : node.computeStatus === 'running' ? 'Setting up' : 'Starting';
          const moving = !done && !failed && !ending && (!paused || pausing);

          return (
            <div key={node.id} className="min-w-0 rounded-lg border bg-muted/10 px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted/60 ring-1 ring-border">
                  <LabOsIcon osFamily={iconFamily(node.osFamily)} className="h-4.5 w-4.5" />
                </span>
                <span className="truncate">{node.label}</span>
              </div>
              <div className={`mt-2 flex items-center gap-1.5 text-[11px] ${failed ? 'text-destructive' : done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                {done ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className={`h-3 w-3 ${moving ? 'motion-safe:animate-spin' : ''}`} />}{label}
              </div>
              <div
                className={styles.track}
                role="progressbar"
                aria-label={`${node.label}: ${label}`}
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={done ? 1 : moving ? undefined : 0}
                aria-valuetext={label}
              >
                {done ? <div className={styles.ready} /> : moving ? <div className={styles.sweep} /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
