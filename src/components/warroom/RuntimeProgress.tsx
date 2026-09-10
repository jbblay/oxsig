import styles from './warroom.module.css';
import { CheckCircle2, CircleDashed, Monitor, Server, Terminal } from 'lucide-react';

type Node = { id: string; label: string; role: string; osFamily: string; status: string; computeStatus?: string; readiness?: string };

export function RuntimeProgress({ nodes, paused = false, status }: { nodes: Node[]; paused?: boolean; status: string }) {
  const stopped = ['failed', 'destroying', 'destroyed'].includes(status);
  const ready = paused || stopped ? 0 : nodes.filter((node) => node.status === 'running').length;
  return (
    <div className="mt-3 space-y-2" aria-label="Environment readiness">
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>{paused ? 'Paused' : stopped ? `Environment ${status}` : 'Verified machines'}</span>
        <span className="font-mono">{ready}/{nodes.length} ready</span>
      </div>
      <progress className="h-2 w-full accent-emerald-500" max={Math.max(nodes.length, 1)} value={ready} aria-label="Machines verified ready" />
      <div className="grid gap-2 sm:grid-cols-3">
        {nodes.map((node) => {
          const Icon = node.role === 'operator' ? Terminal : node.osFamily.toLowerCase().includes('windows') && node.role === 'target' ? Monitor : Server;
          const failed = node.status === 'failed' || status === 'failed';
          const ending = ['destroying', 'destroyed'].includes(node.status) || ['destroying', 'destroyed'].includes(status);
          const done = !paused && !stopped && node.status === 'running';
          const label = paused ? 'Paused' : failed ? 'Failed' : ending ? 'Stopping' : done ? 'Ready' : node.computeStatus === 'running' ? 'Guest setup' : 'Starting';
          return <div key={node.id} className="min-w-0 rounded-lg border bg-muted/10 px-3 py-2">
            <div className="flex items-center gap-2 text-xs"><Icon className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{node.label}</span></div>
            <div className={`mt-2 flex items-center gap-1.5 text-[11px] ${failed ? 'text-destructive' : done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
              {done ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className={`h-3 w-3 ${!paused && !failed && !ending ? 'motion-safe:animate-spin' : ''}`} />}{label}
            </div>
            <div className={styles.track} role="progressbar" aria-label={`${node.label}: ${label}`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={done ? 1 : paused || failed || ending ? 0 : undefined} aria-valuetext={label}>
              {done ? <div className={styles.ready} /> : !paused && !failed && !ending ? <div className={styles.sweep} /> : null}
            </div>
          </div>;
        })}
      </div>
    </div>
  );
}
