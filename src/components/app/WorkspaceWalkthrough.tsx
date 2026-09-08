'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, Compass, LibraryBig, MessageCircle, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const STORAGE_KEY = 'oxsig:quick-tour:v1';
const steps = [
  { title: 'Choose your workspace', label: 'Explore', color: 'home', icon: Compass, href: '/home', action: 'Open dashboard', description: 'Start with the tool you need. Return to the dashboard whenever you want to switch workspaces.', instructions: ['Use a workspace row to open its tool.', 'Use Search or jump in the header to move quickly.'] },
  { title: 'Build and run a lab', label: 'Run', color: 'labs', icon: Terminal, href: '/labs', action: 'Open Cyber Lab', description: 'Work with machines, a topology canvas, and a terminal in one place.', instructions: ['In My Lab, add a machine from Machines and select it on the canvas.', 'Choose an available access mode in Inspector, then start the lab when ready.', 'Open its terminal or desktop. Use focus mode for more room.'] },
  { title: 'Review the evidence', label: 'Review', color: 'evidence', icon: ShieldCheck, href: '/labs', action: 'Open Cyber Lab', description: 'Keep the results of your work connected to the lab that produced them.', instructions: ['Select Evidence in the Cyber Lab toolbar.', 'Review the available records and use the deployment checks when needed.'] },
  { title: 'Keep reusable knowledge', label: 'Save', color: 'vault', icon: LibraryBig, href: '/vault', action: 'Open Vault', description: 'Store useful commands, notes, and findings so they are easy to find again.', instructions: ['Search your Vault or create a new item.', 'Add a clear title and tags, then save your changes.'] },
  { title: 'Work with your team', label: 'Connect', color: 'collab', icon: MessageCircle, href: '/collab', action: 'Open Collaboration', description: 'Continue the conversation alongside your technical work.', instructions: ['Open or create a collaboration session.', 'Use its member controls to invite teammates when you are ready.', 'Use Live Workspace for shared work and Boards for visual planning.'] },
  { title: 'Ask for help in context', label: 'Ask', color: 'ai', icon: Sparkles, href: '/home', action: 'Return to dashboard', description: 'Keep your question close to the workspace you are using.', instructions: ['Use the sparkle button in the header to open AI Helper.', 'Inside Cyber Lab, the same button opens AI Practitioner for lab work.'] },
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
        <Button variant="ghost" size="sm" className="oxsig-tour-trigger h-9 gap-2 px-2" aria-label="Open quick tour" title="Quick tour">
          <Compass className="h-4 w-4" /><span className="hidden lg:inline">Quick tour</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="oxsig-walkthrough w-[calc(100%_-_1.5rem)] max-w-2xl gap-0 overflow-y-auto rounded-2xl p-0">
        <div className="border-b px-5 py-4 pr-14 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-base"><BookOpen className="h-4 w-4 text-primary" />Quick tour</DialogTitle>
          <DialogDescription className="mt-2">Explore at your pace. Close this guide anytime and return from the header.</DialogDescription>
        </div>

        <nav className="oxsig-tour-map" aria-label="Walkthrough steps">
          <ol>
            {steps.map((item, index) => {
              const StepIcon = item.icon;
              return (
                <li key={item.label}>
                  <button type="button" className="oxsig-tour-stop" aria-current={index === step ? 'step' : undefined} aria-label={`Step ${index + 1}: ${item.title}`} onClick={() => selectStep(index)}>
                    <span className="oxsig-workspace-icon" data-workspace-color={item.color}><StepIcon className="h-5 w-5" /></span>
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="px-5 pb-5 sm:px-6" aria-live="polite" aria-atomic="true">
          <div key={step} className="oxsig-tour-step">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Step {step + 1} of {steps.length}</p>
            <h3 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><Icon className="h-5 w-5 shrink-0 text-primary" />{current.title}</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">{current.description}</p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              {current.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
            </ol>
            <Button asChild variant="outline" className="mt-5 min-h-11">
              <Link href={current.href} onClick={() => setOpen(false)}>{current.action}<ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>

        <div className="oxsig-tour-footer flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-5 py-4 sm:px-6">
          <Button variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>Close tour</Button>
          <div className="flex gap-2">
            <Button variant="outline" className="min-h-11" disabled={step === 0} onClick={() => selectStep(step - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
            <Button className="min-h-11" onClick={() => {
              if (step === steps.length - 1) { selectStep(0); setOpen(false); }
              else selectStep(step + 1);
            }}>{step === steps.length - 1 ? 'Finish tour' : 'Next'}<ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
