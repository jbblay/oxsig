'use client';

import * as React from 'react';
import { AlertTriangle, Bot, Loader2, Mic, Play, Sparkles, Square, Terminal, Volume2, X } from 'lucide-react';
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
import type { OperationAiNodeContext } from '@/lib/operations/ai-context';
import { getCsrfToken } from '@/lib/security/csrf-client';
import { useOxsigVoiceInput } from '@/lib/voice/use-voice-input';
import { useOxsigVoicePlayback } from '@/lib/voice/use-voice-playback';

type TeachingMode = 'learn' | 'guided' | 'challenge' | 'operator';

type Props = {
  embedded?: boolean;
  runId?: string | null;
  operationSlug: string;
  operationLabel: string;
  operationMode?: string | null;
  objectives: string[];
  nodes?: OperationAiNodeContext[];
  selectedNode?: OperationAiNodeContext | null;
};

type Turn = {
  id: string;
  question: string;
  plan: AiPractitionerPlan;
  targetLabel: string;
  labInstanceId: string | null;
};

type ChatLine = { role: 'user' | 'assistant'; content: string };

const TEACHING_MODES: Array<{ id: TeachingMode; label: string; policy: string }> = [
  { id: 'learn', label: 'Learn', policy: 'Teach the concept first. Use analogy, concrete examples and a compact text diagram when useful. Demonstrate only when I ask.' },
  { id: 'guided', label: 'Guided', policy: 'Coach me through the objective. Ask for my reasoning before giving away an important next decision when useful.' },
  { id: 'challenge', label: 'Challenge', policy: 'Make me drive. Withhold commands and direct next-step answers until I attempt the step or explicitly ask for a hint.' },
  { id: 'operator', label: 'Operator', policy: 'Be concise and action-oriented. You may propose one useful lab action when I ask, but Oxsig still requires visible approval.' },
];

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

export default function OperationAiInstructor({
  embedded = false,
  runId,
  operationSlug,
  operationLabel,
  operationMode,
  objectives,
  nodes = [],
  selectedNode = null,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [history, setHistory] = React.useState<ChatLine[]>([]);
  const [terminalConnected, setTerminalConnected] = React.useState(false);
  const [teachingMode, setTeachingMode] = React.useState<TeachingMode>('guided');
  const voicePlayback = useOxsigVoicePlayback();
  const voiceInput = useOxsigVoiceInput({
    onTranscript: ({ transcript }) => setPrompt((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript),
    onError: (error) => toast.error(error.message),
  });

  const executableLabId = selectedNode?.labInstanceId || null;
  const selectedRunning = selectedNode?.status === 'running';
  const teachingPolicy = TEACHING_MODES.find((item) => item.id === teachingMode)?.policy || TEACHING_MODES[1].policy;

  React.useEffect(() => {
    const key = `oxsig:operation-ai-teaching-mode:v1:${operationSlug}`;
    const saved = window.localStorage.getItem(key) as TeachingMode | null;
    if (saved && TEACHING_MODES.some((item) => item.id === saved)) setTeachingMode(saved);
  }, [operationSlug]);

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

  function selectTeachingMode(next: TeachingMode) {
    setTeachingMode(next);
    window.localStorage.setItem(`oxsig:operation-ai-teaching-mode:v1:${operationSlug}`, next);
  }

  async function ask() {
    const question = prompt.trim();
    if (!question || busy) return;
    const id = uid();
    const nextHistory: ChatLine[] = [...history, { role: 'user', content: question }];
    setHistory(nextHistory);
    setPrompt('');
    setBusy(id);
    try {
      const topology = nodes.length
        ? nodes.map((node) => `${node.label}: ${node.osFamily}, ${node.role}, status ${node.status}${node.privateIp ? `, private IP ${node.privateIp}` : ''}`).join('; ')
        : 'No live topology is currently attached. Concept teaching is still available.';
      const learningContext = [
        'OXSIG OPERATION CONTEXT (authoritative training environment):',
        `Operation: ${operationLabel} (${operationSlug}); run: ${runId || 'not started'}; operation mode: ${operationMode || 'learning'}.`,
        `Objectives: ${objectives.join(' | ') || 'Teach the operation subject through explanation, reasoning and practice.'}`,
        `Topology: ${topology}`,
        selectedNode ? `Learner-selected machine: ${selectedNode.label} (${selectedNode.osFamily}, ${selectedNode.role}).` : 'No executable machine is selected. Do not require a lab for conceptual teaching.',
        `OXSIG TEACHING MODE: ${teachingMode}. ${teachingPolicy}`,
        'Teaching policy: the curriculum is structured but the teaching is adaptive. Answer conceptual questions directly. Use a useful analogy, concrete example, and compact text diagram when they improve understanding. Connect theory to live practice only when useful. Never claim an action ran until real terminal evidence is returned.',
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
      setTurns((current) => [...current, {
        id,
        question,
        plan: body.plan,
        targetLabel: selectedNode?.label || 'Operation',
        labInstanceId: selectedRunning ? executableLabId : null,
      }]);
      setHistory((current) => [...current, { role: 'assistant', content: body.plan.explanation }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI Instructor failed');
    } finally {
      setBusy(null);
    }
  }

  async function run(turn: Turn) {
    if (!turn.plan.command || !turn.labInstanceId || !selectedRunning) {
      toast.error('Select a running Operation machine that supports bound terminal execution.');
      return;
    }
    if (turn.labInstanceId !== executableLabId) {
      toast.error(`Re-select ${turn.targetLabel} or ask the Instructor to regenerate this step for the current machine.`);
      return;
    }
    if (!terminalConnected) {
      toast.error('Open this machine’s Terminal and wait for Connected before approving the command.');
      return;
    }
    setBusy(`run:${turn.id}`);
    try {
      const result = await executeVisible(turn.labInstanceId, turn.plan.command);
      if (result.error) throw new Error(result.error);
      const observed = [result.stdout, result.stderr ? `stderr: ${result.stderr}` : ''].filter(Boolean).join('\n') || '(no text output)';
      setHistory((current) => [...current, {
        role: 'assistant',
        content: `Real terminal evidence from ${turn.targetLabel}: exit ${result.exitCode}. ${observed.slice(0, 3000)}`,
      }]);
      setPrompt(`The approved command ran on ${turn.targetLabel} with exit ${result.exitCode}. Help me interpret the real evidence using ${teachingMode} teaching mode.`);
      toast.success('Approved command completed in the visible Operation terminal.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operation command failed');
    } finally {
      setBusy(null);
    }
  }

  async function speak(turn: Turn) {
    const key = `operation-ai:${turn.id}`;
    if (voicePlayback.speakingKey === key) {
      voicePlayback.stop();
      return;
    }
    try {
      await voicePlayback.play(turn.plan.explanation, key);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error(error instanceof Error ? error.message : 'Voice playback failed');
    }
  }

  return (
    <>
      {!embedded && <Button size="sm" onClick={() => setOpen(true)}><Bot className="mr-1.5 h-4 w-4" />AI Instructor</Button>}
      {(embedded || open) && (
        <aside className={embedded ? "flex max-h-[75dvh] min-h-96 min-w-0 flex-col overflow-hidden rounded-xl bg-card" : "fixed inset-x-2 bottom-2 top-[74px] z-[60] flex flex-col overflow-hidden rounded-2xl border bg-background/97 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-4 sm:w-[470px]"}>
          <div className="border-b p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Operation AI Instructor</h2><Badge variant="secondary">{operationLabel}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground">{selectedNode ? `${selectedNode.label} · ${selectedNode.osFamily} · ${selectedNode.role}` : 'Concept learning available without a running machine'}{executableLabId ? terminalConnected ? ' · terminal connected' : ' · open terminal for execution' : ''}</p>
              </div>
              {!embedded && <Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Close AI Instructor"><X className="h-4 w-4" /></Button>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1" aria-label="AI teaching mode">
              {TEACHING_MODES.map((item) => (
                <Button key={item.id} size="sm" variant={teachingMode === item.id ? 'default' : 'outline'} className="h-7 px-2 text-[11px]" onClick={() => selectTeachingMode(item.id)} title={item.policy}>
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="oxsig-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <details className="rounded-xl border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground"><summary className="cursor-pointer font-medium">How the Instructor helps</summary><p className="mt-2">Ask about the Operation before starting a machine, request an analogy or diagram, practice interactively, or switch to Challenge mode and drive the investigation yourself. Live commands still require your explicit approval.</p></details>
            {embedded && turns.length === 0 && <div className="flex flex-wrap gap-2">
              {['Summarize this mission', 'Explain the selected machine', 'Give me a hint for the first objective'].map((question) => <Button key={question} size="sm" variant="outline" className="h-auto whitespace-normal text-left text-xs" onClick={() => setPrompt(question)}>{question}</Button>)}
            </div>}
            {turns.map((turn) => {
              const speechKey = `operation-ai:${turn.id}`;
              return (
                <div key={turn.id} className="space-y-3">
                  <div className="ml-8 rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground">{turn.question}</div>
                  <div className="space-y-3 rounded-2xl border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <p className="min-w-0 flex-1 font-semibold">{turn.plan.title}</p>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void speak(turn)} aria-label={voicePlayback.speakingKey === speechKey ? 'Stop voice playback' : 'Listen to explanation'} title="Listen with Oxsig voice">
                        {voicePlayback.speakingKey === speechKey ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-6">{turn.plan.explanation}</div>
                    {turn.plan.command && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium"><Terminal className="h-3.5 w-3.5" />Proposed on {turn.targetLabel}</div>
                        <pre className="overflow-x-auto rounded-xl border bg-black/90 p-3 text-xs text-white"><code>{turn.plan.command}</code></pre>
                        <p className="text-xs text-muted-foreground">Expected: {turn.plan.expected}</p>
                        <Button className="w-full" disabled={!!busy || !turn.labInstanceId || turn.labInstanceId !== executableLabId || !terminalConnected} onClick={() => void run(turn)}>
                          {busy === `run:${turn.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Approve &amp; run visibly
                        </Button>
                        {!turn.labInstanceId && <p className="text-xs text-muted-foreground">Concept teaching does not require a machine. Start or select a compatible Operation machine only when you want real execution.</p>}
                        {turn.plan.risk === 'changes-system' && <div className="flex gap-2 text-xs text-amber-600"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{turn.plan.approvalReason}</div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {busy && !busy.startsWith('run:') && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Instructor is adapting the next step…</div>}
          </div>
          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder="Ask a concept, request an analogy or diagram, tell me your next step, or ask for a hint…" className="min-h-[72px] flex-1 resize-none" disabled={!!busy || voiceInput.processing} />
              {voiceInput.supported && (
                <Button size="icon" variant={voiceInput.recording ? 'default' : 'outline'} className="h-10 w-10 shrink-0" disabled={!!busy || voiceInput.processing} onClick={() => voiceInput.recording ? voiceInput.stop() : void voiceInput.start()} aria-label={voiceInput.recording ? 'Stop voice input' : 'Start voice input'} title={voiceInput.recording ? 'Stop recording' : 'Speak to the Instructor'}>
                  {voiceInput.processing ? <Loader2 className="h-4 w-4 animate-spin" /> : voiceInput.recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
            </div>
            {voiceInput.recording && <p className="mt-1 text-[11px] text-muted-foreground">Listening… tap stop when you are finished.</p>}
            <Button className="mt-2 w-full" disabled={!!busy || !prompt.trim()} onClick={() => void ask()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Continue learning</Button>
          </div>
        </aside>
      )}
    </>
  );
}

