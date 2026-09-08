'use client';

import * as React from 'react';
import { CircleDot, SquareTerminal } from 'lucide-react';

type TerminalActivityStripProps = {
  running?: boolean;
  label?: string;
};

const RUNNING_STEPS = [
  'attach session',
  'stream terminal output',
  'sync workspace state',
  'capture evidence channel',
] as const;

export default function TerminalActivityStrip({ running = false, label = 'Terminal activity' }: TerminalActivityStripProps) {
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    if (!running) {
      setStep(0);
      return;
    }
    const timer = window.setInterval(() => setStep((value) => (value + 1) % RUNNING_STEPS.length), 1800);
    return () => window.clearInterval(timer);
  }, [running]);

  return (
    <div className="oxsig-terminal-strip" data-running={running ? 'true' : 'false'} role="status" aria-live="polite">
      <span className="oxsig-terminal-icon"><SquareTerminal className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-xs">
          <span className="text-primary">oxsig&gt;</span>
          <span className="truncate">{running ? RUNNING_STEPS[step] : 'ready for session'}</span>
          <span className={running ? 'oxsig-terminal-cursor' : 'opacity-40'}>▌</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        <CircleDot className={running ? 'h-3.5 w-3.5 animate-pulse text-emerald-500' : 'h-3.5 w-3.5'} />
        {running ? 'Running' : 'Idle'}
      </span>
    </div>
  );
}
