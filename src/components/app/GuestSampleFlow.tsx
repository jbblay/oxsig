'use client';

import * as React from 'react';
import { ArrowRight, Check, Play, RotateCcw, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { recordWorkspaceActivity } from '@/lib/persistence/workspace-activity';

const steps = [
  { label: 'Build', command: 'topology validate --sample' },
  { label: 'Run', command: 'lab start sample-linux' },
  { label: 'Review', command: 'evidence inspect --latest' },
  { label: 'Save', command: 'vault capture session-notes' },
] as const;

export default function GuestSampleFlow() {
  const [active, setActive] = React.useState(false);
  const [step, setStep] = React.useState(0);

  const start = () => {
    setActive(true);
    setStep(0);
    recordWorkspaceActivity({ label: 'Started guest sample flow', detail: 'No cloud resources created', href: '/home', color: 'labs', kind: 'action' });
  };

  const next = () => {
    if (step >= steps.length - 1) {
      setActive(false);
      setStep(0);
      recordWorkspaceActivity({ label: 'Completed guest sample flow', detail: 'Build → Run → Review → Save', href: '/home', color: 'labs', kind: 'action' });
      return;
    }
    setStep((value) => value + 1);
  };

  if (!active) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-card/40 px-3 py-2.5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-cyan-500/10 text-cyan-500"><Play className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold">Sample workspace</p>
            <p className="truncate text-[10px] text-muted-foreground">Try the OXSIG workflow without starting cloud resources.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs sm:ml-auto" onClick={start}>Launch sample</Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-cyan-500/20 bg-card/55">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Terminal className="h-3.5 w-3.5 text-cyan-500" />
        <span className="text-xs font-semibold">Guest sample</span>
        <span className="ml-auto text-[10px] text-muted-foreground">No AWS resources</span>
      </div>
      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="bg-slate-950 px-3 py-3 font-mono text-[11px] text-slate-200">
          <p><span className="text-cyan-400">oxsig&gt;</span> {steps[step].command}</p>
          <p className="mt-2 text-emerald-400">✓ {steps[step].label} stage ready</p>
          <p className="mt-1 text-slate-500">sample mode · local simulation</p>
        </div>
        <div className="p-2.5">
          <div className="grid grid-cols-4 gap-1">
            {steps.map((item, index) => (
              <div key={item.label} className={`rounded-md border px-1.5 py-2 text-center text-[9px] ${index === step ? 'border-cyan-500/30 bg-cyan-500/5 text-foreground' : index < step ? 'bg-muted/30 text-muted-foreground' : 'text-muted-foreground'}`}>
                {index < step ? <Check className="mx-auto mb-1 h-3 w-3 text-emerald-500" /> : <span className="mb-1 block font-mono">0{index + 1}</span>}
                {item.label}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => { setActive(false); setStep(0); }}><RotateCcw className="h-3 w-3" /> Reset</Button>
            <Button size="sm" className="ml-auto h-7 px-2 text-[10px]" onClick={next}>{step === steps.length - 1 ? 'Finish' : 'Next'}<ArrowRight className="h-3 w-3" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
