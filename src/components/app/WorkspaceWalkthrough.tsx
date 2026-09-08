'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, Compass, LibraryBig, MessageCircle, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const STORAGE_KEY = 'oxsig:quick-tour:v1';
const steps = [
  { title: 'Choose your workspace', label: 'Explore', color: 'home', icon: Compass, href: '/home', action: 'Open dashboard', description: 'Open the tool you need, then move between workspaces from the header or navigation.', instructions: ['Choose a workspace from the dashboard.', 'Use Search or jump for faster navigation.'] },
  { title: 'Build and run a lab', label: 'Run', color: 'labs', icon: Terminal, href: '/labs', action: 'Open Cyber Lab', description: 'Build the topology, select a machine, and open the terminal or desktop.', instructions: ['Add a machine and select it.', 'Choose an access mode and start the lab.', 'Open terminal or desktop; use focus mode when needed.'] },
  { title: 'Review the evidence', label: 'Review', color: 'evidence', icon: ShieldCheck, href: '/labs', action: 'Open Cyber Lab', description: 'Review evidence from the environment that produced it.', instructions: ['Open Evidence in Cyber Lab.', 'Use deployment checks when you need deeper verification.'] },
  { title: 'Keep reusable knowledge', label: 'Save', color: 'vault', icon: LibraryBig, href: '/vault', action: 'Open Vault', description: 'Save commands, notes, and findings worth reusing.', instructions: ['Search Vault or create an item.', 'Add a clear title and save.'] },
  { title: 'Work with your team', label: 'Connect', color: 'collab', icon: MessageCircle, href: '/collab', action: 'Open Collaboration', description: 'Keep conversation close to the technical work.', instructions: ['Open or create a session.', 'Invite people when needed.', 'Use Live Workspace and Boards for shared work.'] },
  { title: 'Ask for help in context', label: 'Ask', color: 'ai', icon: Sparkles, href: '/home', action: 'Return to dashboard', description: 'Open AI from the workspace where you are already working.', instructions: ['Use the sparkle button for AI Helper.', 'In Cyber Lab it opens AI Practitioner.'] },
] as const;

export default function WorkspaceWalkthrough() {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);

  function changeOpen(next: boolean) {
    if (next) {
      try {
        const saved = Number(window.localStorage.getItem(STORAGE_KEY));
        setStep(Number.isInteger(saved) && saved >= 0 && saved < steps.length ? saved : 0);
      } catch {
        setStep(0);
      }
    }
    setOpen(next);
  }

  function selectStep(next: number) {
    setStep(next);
    try { window.localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* The tour also works without browser storage. */ }
  }

  const current = steps[step];
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="oxsig-tour-trigger h-8 w-8" aria-label="Open quick tour" title="Quick tour">
          <Compass className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="oxsig-walkthrough w-[calc(100%_-_1rem)] max-w-lg gap-0 overflow-y-auto rounded-xl p-0">
        <div className="border-b px-4 py-3 pr-12">
          <DialogTitle className="flex items-center gap-2 text-sm"><BookOpen className="h-3.5 w-3.5 text-primary" />Quick tour</DialogTitle>
          <DialogDescription className="mt-1 text-xs">Six quick stops. Close anytime.</DialogDescription>
        </div>

        <nav className="oxsig-tour-map" aria-label="Walkthrough steps">
          <ol>
            {steps.map((item, index) => {
              const StepIcon = item.icon;
              return (
                <li key={item.label}>
                  <button type="button" className="oxsig-tour-stop" aria-current={index === step ? 'step' : undefined} aria-label={`Step ${index + 1}: ${item.title}`} onClick={() => selectStep(index)}>
                    <span className="oxsig-workspace-icon" data-workspace-color={item.color}><StepIcon className="h-4 w-4" /></span>
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="px-4 pb-4" aria-live="polite" aria-atomic="true">
          <div key={step} className="oxsig-tour-step">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{step + 1} / {steps.length}</p>
            <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight"><Icon className="h-4 w-4 shrink-0 text-primary" />{current.title}</h3>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">{current.description}</p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-5">
              {current.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
            </ol>
            <Button asChild variant="outline" size="sm" className="mt-4 h-9">
              <Link href={current.href} onClick={() => setOpen(false)}>{current.action}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Link>
            </Button>
          </div>
        </div>

        <div className="oxsig-tour-footer flex items-center justify-between gap-2 border-t bg-muted/15 px-3 py-2.5">
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setOpen(false)}>Close tour</Button>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-8" disabled={step === 0} onClick={() => selectStep(step - 1)}><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back</Button>
            <Button size="sm" className="h-8" onClick={() => {
              if (step === steps.length - 1) { selectStep(0); setOpen(false); }
              else selectStep(step + 1);
            }}>{step === steps.length - 1 ? 'Finish tour' : 'Next'}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
