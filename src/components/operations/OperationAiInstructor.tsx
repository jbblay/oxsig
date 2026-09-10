'use client';

import * as React from 'react';
import { AlertTriangle, Bot, Loader2, Play, Sparkles, Terminal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { AiPractitionerPlan } from '@/lib/ai-practitioner/types';
import {
  AI_TERMINAL_QUERY_EVENT,
  AI_TERMINAL_RESULT_EVENT,
  AI_TERMINAL_RUN_EVENT,
  AI_TERMINAL_STATE_EVENT,
  type AiTerminalRunRequest,
  type AiTerminalRunResult,
  type AiTerminalState,
} from '@/lib/labs/ai-terminal-events';
import { getCsrfToken } from '@/lib/security/csrf-client';

type NodeContext = {
  id: string;
  key: string;
  label: string;
  role: string;
  osFamily: string;
  status: string;
  privateIp: string | null;
  labInstanceId: string | null;
};

type Props = {
  runId: string;
  operationSlug: string;
  operationMode: string;
  objectives: string[];
  nodes: NodeContext[];
  selectedNode: NodeContext | null;
};

type Turn = { id: string; question: string; plan: AiPractitionerPlan; targetLabel: string };
type ChatLine = { role: 'user' | 'assistant'; content: string };

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

function executeVisible(labInstanceId: string, command: string) {
  return new Promise<AiTerminalRunResult>((resolve, reject) => {
    const requestId = uid();
    const timer = window.setTimeout(() => {
      window.removeEventListener(AI_TERMINAL_RESULT_EVENT, onResult);
      reject(new Error('The live terminal did not return the approved command in time.'));
    }, 50_000);
    function onResult(event: Event) {
      const detail = (event as CustomEvent<AiTerminalRunResult>).detail;
      if (!detail || detail.requestId !== requestId || detail.labInstanceId !== labInstanceId) return;
      window.clearTimeout(timer);
      window.removeEventListener(AI_TERMINAL_RESULT_EVENT, onResult);
      resolve(detail);
    }
    window.addEventListener(AI_TERMINAL_RESULT_EVENT, onResult);
    window.dispatchEvent(new CustomEvent<AiTerminalRunRequest>(AI_TERMINAL_RUN_EVENT, {
      detail: { requestId, labInstanceId, command, surface: 'ai-practitioner' },
    }));
  });
}

export default function OperationAiInstructor({ runId, operationSlug, operationMode, objectives, nodes, selectedNode }: Props) {
  const [open, setOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [history, setHistory] = React.useState<ChatLine[]>([]);
  const [terminalConnected, setTerminalConnected] = React.useState(false);

  const executableLabId = selectedNode?.labInstanceId || null;
  const selectedRunning = selectedNode?.status === 'running';

  React.useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<AiTerminalState>).detail;
      if (!detail || detail.labInstanceId !== executableLabId) return;
      setTerminalConnected(detail.connected);
    };
    setTerminalConnected(false);
    window.addEventListener(AI_TERMINAL_STATE_EVENT, onState);
    window.dispatchEvent(new Event(AI_TERMINAL_QUERY_EVENT));
    return () => window.removeEventListener(AI_TERMINAL_STATE_EVENT, onState);
  }, [executableLabId]);

  async function ask() {
    const question = prompt.trim();
    if (!question || busy) return;
    const id = uid();
    const nextHistory: ChatLine[] = [...history, { role: 'user', content: question }];
    setHistory(nextHistory);
    setPrompt('');
    setBusy(id);
    try {
      const topology = nodes.map((node) => `${node.label}: ${node.osFamily}, ${node.role}${node.privateIp ? `, private IP ${node.privateIp}` : ''}`).join('; ');
      const learningContext = [
        `OXSIG OPERATION CONTEXT (authoritative training environment):`,
        `Operation: ${operationSlug}; run: ${runId}; mode: ${operationMode}.`,
        `Objectives: ${objectives.join(' | ') || 'Follow the Operation objective and teach through practice.'}`,
        `Topology: ${topology}.`,
        selectedNode ? `Learner-selected machine: ${selectedNode.label} (${selectedNode.osFamily}, ${selectedNode.role}).` : 'No machine selected.',
        `Teaching policy: act as an adaptive instructor, not a static tutorial. First assess the learner's reasoning when useful. Give the smallest useful explanation or hint. Propose at most one command only when live evidence advances learning. Never claim an action ran until real terminal evidence is returned.`,
        `Learner request: ${question}`,
      ].join('\n');
      const token = await getCsrfToken();
      const response = await fetch('/api/ai/practitioner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({
          action: 'plan',
          labInstanceId: selectedRunning && executableLabId ? executableLabId : undefined,
          prompt: learningContext,
          history: nextHistory.slice(-8),
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'AI Instructor could not answer'));
      const body = await response.json() as { plan: AiPractitionerPlan };
      setTurns((current) => [...current, { id, question, plan: body.plan, targetLabel: selectedNode?.label || 'Operation' }]);
      setHistory((current) => [...current, { role: 'assistant', content: body.plan.explanation }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI Instructor failed');
    } finally {
      setBusy(null);
    }
  }

  async function run(turn: Turn) {
    if (!turn.plan.command || !executableLabId || !selectedRunning) {
      toast.error('Select a running Operation machine that supports bound terminal execution.');
      return;
    }
    if (!terminalConnected) {
      toast.error('Open this machine’s Terminal and wait for Connected before approving the command.');
      return;
    }
    setBusy(`run:${turn.id}`);
    try {
      const result = await executeVisible(executableLabId, turn.plan.command);
      if (result.error) throw new Error(result.error);
      const observed = [result.stdout, result.stderr ? `stderr: ${result.stderr}` : ''].filter(Boolean).join('\n') || '(no text output)';
      setHistory((current) => [...current, {
        role: 'assistant',
        content: `Real terminal evidence from ${turn.targetLabel}: exit ${result.exitCode}. ${observed.slice(0, 3000)}`,
      }]);
      setPrompt(`The approved command ran on ${turn.targetLabel} with exit ${result.exitCode}. Ask me to interpret the real evidence and decide the next learning step.`);
      toast.success('Approved command completed in the visible Operation terminal.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operation command failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Bot className="mr-1.5 h-4 w-4" />AI Instructor</Button>
      {open && (
        <aside className="fixed inset-x-2 bottom-2 top-[74px] z-[60] flex flex-col overflow-hidden rounded-2xl border bg-background/97 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-4 sm:w-[470px]">
          <div className="flex items-start gap-3 border-b p-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Operation AI Instructor</h2><Badge variant="secondary">Black Domain pilot</Badge></div>
              <p className="mt-1 text-xs text-muted-foreground">{selectedNode ? `${selectedNode.label} · ${selectedNode.osFamily} · ${selectedNode.role}` : 'Select a machine'}{executableLabId ? terminalConnected ? ' · terminal connected' : ' · open terminal for execution' : ' · guidance only on this node'}</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Close AI Instructor"><X className="h-4 w-4" /></Button>
          </div>
          <div className="oxsig-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="rounded-xl border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">I use the live Operation objective, topology and selected machine as teaching context. I can question, hint, correct and explain without forcing a fixed tutorial. Commands still require your explicit approval.</div>
            {turns.map((turn) => (
              <div key={turn.id} className="space-y-3">
                <div className="ml-8 rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground">{turn.question}</div>
                <div className="space-y-3 rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="font-semibold">{turn.plan.title}</p></div>
                  <p className="text-sm leading-6">{turn.plan.explanation}</p>
                  {turn.plan.command && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium"><Terminal className="h-3.5 w-3.5" />Proposed on {turn.targetLabel}</div>
                      <pre className="overflow-x-auto rounded-xl border bg-black/90 p-3 text-xs text-white"><code>{turn.plan.command}</code></pre>
                      <p className="text-xs text-muted-foreground">Expected: {turn.plan.expected}</p>
                      <Button className="w-full" disabled={!!busy || !executableLabId || !terminalConnected} onClick={() => void run(turn)}>
                        {busy === `run:${turn.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Approve & run visibly
                      </Button>
                      {!executableLabId && <p className="text-xs text-muted-foreground">This pilot executes only on an Operation node with a bound Cyber Lab identity. Select the Ubuntu operator for visible approved execution; other Black Domain nodes remain available for guidance and direct learner access.</p>}
                      {turn.plan.risk === 'changes-system' && <div className="flex gap-2 text-xs text-amber-600"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{turn.plan.approvalReason}</div>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && !busy.startsWith('run:') && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Instructor is adapting the next step…</div>}
          </div>
          <div className="border-t p-3">
            <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder="Tell me what you want to learn, what you think the next step is, or ask for a hint…" className="min-h-[72px] resize-none" disabled={!!busy} />
            <Button className="mt-2 w-full" disabled={!!busy || !prompt.trim()} onClick={() => void ask()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Continue learning</Button>
          </div>
        </aside>
      )}
    </>
  );
}
