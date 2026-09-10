'use client';

import * as React from 'react';
import { AlertTriangle, Bot, BrainCircuit, CheckCircle2, Loader2, Play, Send, Server, Sparkles, Terminal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { AiPractitionerAnalysis, AiPractitionerExecution, AiPractitionerPlan } from '@/lib/ai-practitioner/types';
import {
  OPERATION_AI_TARGET_EVENT,
  OPERATION_AI_TARGET_SELECT_EVENT,
  OPERATION_AI_TERMINAL_QUERY_EVENT,
  OPERATION_AI_TERMINAL_RESULT_EVENT,
  OPERATION_AI_TERMINAL_RUN_EVENT,
  OPERATION_AI_TERMINAL_STATE_EVENT,
  type OperationAiTarget,
  type OperationAiTargetSelect,
  type OperationAiTerminalRunRequest,
  type OperationAiTerminalRunResult,
  type OperationAiTerminalState,
} from '@/lib/operations/ai-terminal-events';
import { getCsrfToken } from '@/lib/security/csrf-client';

type RunNode = {
  id: string;
  key: string;
  label: string;
  role: 'operator' | 'target' | 'infrastructure';
  osFamily: string;
  status: string;
  computeStatus?: string;
  privateIp: string | null;
};

type Run = {
  id: string;
  operationSlug: string;
  mode: 'practice' | 'walkthrough' | 'challenge' | 'warroom';
  status: string;
  metadata?: { lifecycleState?: string };
  nodes: RunNode[];
};

type PlanEntry = {
  id: string;
  prompt: string;
  plan: AiPractitionerPlan;
  operationNodeId: string;
  targetLabel?: string;
  execution?: AiPractitionerExecution;
  analysis?: AiPractitionerAnalysis;
};

type ChatLine = { id: string; role: 'user' | 'assistant'; content: string };

const MAX_PROMPT_LENGTH = 4000;

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

function outputText(execution: AiPractitionerExecution) {
  const parts: string[] = [];
  if (execution.stdout.trim()) parts.push(execution.stdout.trim());
  if (execution.stderr.trim()) parts.push(`stderr:\n${execution.stderr.trim()}`);
  return parts.join('\n\n') || '(command returned no text output)';
}

function executeInVisibleOperationTerminal(runId: string, nodeId: string, command: string) {
  return new Promise<OperationAiTerminalRunResult>((resolve, reject) => {
    const requestId = uid();
    const timeout = window.setTimeout(() => {
      window.removeEventListener(OPERATION_AI_TERMINAL_RESULT_EVENT, onResult);
      reject(new Error('The selected Operation terminal did not return the approved command result in time.'));
    }, 52_000);

    const onResult = (event: Event) => {
      const result = (event as CustomEvent<OperationAiTerminalRunResult>).detail;
      if (!result || result.requestId !== requestId || result.runId !== runId || result.nodeId !== nodeId) return;
      window.clearTimeout(timeout);
      window.removeEventListener(OPERATION_AI_TERMINAL_RESULT_EVENT, onResult);
      resolve(result);
    };

    window.addEventListener(OPERATION_AI_TERMINAL_RESULT_EVENT, onResult);
    window.dispatchEvent(new CustomEvent<OperationAiTerminalRunRequest>(OPERATION_AI_TERMINAL_RUN_EVENT, {
      detail: { requestId, runId, nodeId, command, surface: 'ai-practitioner' },
    }));
  });
}

function coachingLabel(mode?: Run['mode']) {
  if (mode === 'walkthrough') return 'Walkthrough coach';
  if (mode === 'challenge') return 'Challenge mentor';
  if (mode === 'warroom') return 'War Room observer';
  return 'Guided practice';
}

export default function OperationAiPractitionerDock({ runId, operationSlug }: { runId: string; operationSlug: string }) {
  const [open, setOpen] = React.useState(false);
  const [run, setRun] = React.useState<Run | null>(null);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [terminalConnected, setTerminalConnected] = React.useState<Record<string, boolean>>({});
  const [prompt, setPrompt] = React.useState('');
  const [entries, setEntries] = React.useState<PlanEntry[]>([]);
  const [history, setHistory] = React.useState<ChatLine[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const target = run?.nodes.find((node) => node.id === selectedNodeId) || null;
  const warRoom = run?.mode === 'warroom';
  const paused = run?.metadata?.lifecycleState === 'paused';
  const targetConnected = Boolean(target && terminalConnected[target.id]);

  React.useEffect(() => {
    const openPractitioner = () => setOpen(true);
    window.addEventListener('oxsig:ai-practitioner:open', openPractitioner);
    return () => window.removeEventListener('oxsig:ai-practitioner:open', openPractitioner);
  }, []);

  const loadRun = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/operations/runs/${encodeURIComponent(runId)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not load the active Operation');
      const next = body.run as Run;
      setRun(next);
      setSelectedNodeId((current) => current && next.nodes.some((node) => node.id === current)
        ? current
        : next.nodes.find((node) => node.role === 'operator')?.id || next.nodes[0]?.id || null);
    } catch (error) {
      console.warn('[oxsig] Operation Practitioner runtime refresh failed:', error);
    }
  }, [runId]);

  React.useEffect(() => {
    void loadRun();
    const timer = window.setInterval(() => void loadRun(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadRun]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/ai/practitioner/operation?runId=${encodeURIComponent(runId)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(await apiError(response, 'Operation Practitioner history could not be loaded'));
        const body = await response.json() as { entries?: PlanEntry[]; history?: ChatLine[] };
        if (cancelled) return;
        setEntries(Array.isArray(body.entries) ? body.entries : []);
        setHistory(Array.isArray(body.history) ? body.history : []);
      } catch (error) {
        console.warn('[oxsig] Operation Practitioner history restore failed:', error);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [runId]);

  React.useEffect(() => {
    const onTarget = (event: Event) => {
      const detail = (event as CustomEvent<OperationAiTarget>).detail;
      if (!detail || detail.runId !== runId) return;
      setSelectedNodeId(detail.nodeId);
    };
    const onTerminalState = (event: Event) => {
      const detail = (event as CustomEvent<OperationAiTerminalState>).detail;
      if (!detail || detail.runId !== runId) return;
      setTerminalConnected((current) => ({ ...current, [detail.nodeId]: detail.connected }));
    };
    window.addEventListener(OPERATION_AI_TARGET_EVENT, onTarget);
    window.addEventListener(OPERATION_AI_TERMINAL_STATE_EVENT, onTerminalState);
    window.dispatchEvent(new Event(OPERATION_AI_TERMINAL_QUERY_EVENT));
    return () => {
      window.removeEventListener(OPERATION_AI_TARGET_EVENT, onTarget);
      window.removeEventListener(OPERATION_AI_TERMINAL_STATE_EVENT, onTerminalState);
    };
  }, [runId]);

  React.useEffect(() => {
    window.dispatchEvent(new Event(OPERATION_AI_TERMINAL_QUERY_EVENT));
  }, [selectedNodeId]);

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 40);
    return () => window.clearTimeout(timer);
  }, [busy, entries, history, open]);

  function selectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    const detail: OperationAiTargetSelect = { runId, nodeId };
    window.dispatchEvent(new CustomEvent<OperationAiTargetSelect>(OPERATION_AI_TARGET_SELECT_EVENT, { detail }));
  }

  async function ask(value = prompt) {
    const question = value.trim();
    if (!question || historyLoading || !target || warRoom || paused) return;
    if (question.length > MAX_PROMPT_LENGTH) {
      toast.error(`Keep the request under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`);
      return;
    }
    const id = uid();
    const nextHistory = [...history, { id: uid(), role: 'user' as const, content: question }];
    setHistory(nextHistory);
    setPrompt('');
    setBusy(id);
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/ai/practitioner/operation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({
          action: 'plan',
          runId,
          nodeId: target.id,
          prompt: question,
          history: nextHistory.slice(-8).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'AI Practitioner could not answer'));
      const body = await response.json() as { plan: AiPractitionerPlan; target?: { nodeId?: string; label?: string } };
      const operationNodeId = body.target?.nodeId || target.id;
      const targetLabel = body.target?.label || target.label;
      setEntries((current) => [...current, { id, prompt: question, plan: body.plan, operationNodeId, targetLabel }]);
      setHistory((current) => [...current, { id: uid(), role: 'assistant', content: body.plan.explanation }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI Practitioner failed');
    } finally {
      setBusy(null);
    }
  }

  async function runCommand(entry: PlanEntry) {
    if (!entry.plan.command) return;
    if (!target || target.id !== entry.operationNodeId) {
      toast.error(`This command was planned for ${entry.targetLabel || 'another machine'}. Select that exact machine before approving it.`);
      return;
    }
    if (!targetConnected) {
      toast.error(`Open ${target.label} Terminal and wait for Connected before approving this command.`);
      return;
    }
    setBusy(`run:${entry.id}`);
    try {
      toast.info(`Binding the approved command to ${target.label} and running it visibly…`);
      const terminalResult = await executeInVisibleOperationTerminal(runId, target.id, entry.plan.command);
      if (terminalResult.error) throw new Error(terminalResult.error);
      if (
        terminalResult.surface !== 'ai-practitioner' ||
        !terminalResult.executionId ||
        !terminalResult.evidenceId ||
        !terminalResult.executionReceiptId ||
        !terminalResult.terminalSessionId ||
        terminalResult.provenance !== 'browser-observed' ||
        (terminalResult.risk !== 'read-only' && terminalResult.risk !== 'changes-system')
      ) throw new Error('The Operation terminal returned incomplete session-bound execution evidence.');

      const execution: AiPractitionerExecution = {
        command: terminalResult.command,
        stdout: terminalResult.stdout,
        stderr: terminalResult.stderr,
        exitCode: terminalResult.exitCode,
        risk: terminalResult.risk,
        executionId: terminalResult.executionId,
        evidenceId: terminalResult.evidenceId,
        provenance: terminalResult.provenance,
        executionReceiptId: terminalResult.executionReceiptId,
        terminalSessionId: terminalResult.terminalSessionId,
        surface: 'ai-practitioner',
      };
      setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, execution } : item));

      const token = await getCsrfToken();
      const analysisResponse = await fetch('/api/ai/practitioner/operation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({
          action: 'explain',
          runId,
          nodeId: target.id,
          evidenceId: execution.evidenceId,
          prompt: entry.prompt,
          command: execution.command,
          stdout: execution.stdout,
          stderr: execution.stderr,
          exitCode: execution.exitCode,
        }),
      });
      if (!analysisResponse.ok) throw new Error(await apiError(analysisResponse, 'The command ran, but AI could not explain the result'));
      const analysisBody = await analysisResponse.json() as { analysis: AiPractitionerAnalysis };
      setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, execution, analysis: analysisBody.analysis } : item));
      setHistory((current) => [...current, { id: uid(), role: 'assistant', content: analysisBody.analysis.summary }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI Practitioner execution failed');
    } finally {
      setBusy(null);
    }
  }

  const planBusy = Boolean(busy && !busy.startsWith('run:'));

  return (
    <>
      {open && (
        <aside className="fixed inset-x-2 bottom-2 top-[74px] z-50 flex flex-col overflow-hidden rounded-2xl border bg-background/97 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-4 sm:w-[480px]">
          <div className="border-b bg-gradient-to-r from-primary/10 via-background to-purple-500/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg"><BrainCircuit className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Operation Practitioner</h2><Badge variant="secondary" className="text-[9px]">{coachingLabel(run?.mode)}</Badge></div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{target ? `${target.label} · ${target.osFamily}${targetConnected ? ' · terminal connected' : ''}` : 'Loading Operation machines…'}</p>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close Operation Practitioner"><X className="h-4 w-4" /></Button>
            </div>
          </div>

          <div ref={scrollRef} className="oxsig-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {warRoom ? (
              <div className="rounded-2xl border p-4">
                <div className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4" />War Room assistance is locked</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">War Room measures how quickly participants can investigate, execute, and document independently. The teaching/command Practitioner is therefore disabled for this run.</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><Server className="h-3.5 w-3.5" />Teaching target</div>
                  <div className="flex flex-wrap gap-1.5">
                    {run?.nodes.map((node) => (
                      <Button key={node.id} size="sm" variant={node.id === selectedNodeId ? 'default' : 'outline'} className="h-auto min-h-8 whitespace-normal text-[10px]" onClick={() => selectNode(node.id)}>
                        {node.label}{terminalConnected[node.id] ? ' · connected' : ''}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">Changing the teaching target also selects that machine in My Lab. A command planned for one machine cannot be approved on another.</p>
                </div>

                {!historyLoading && entries.length === 0 && (
                  <div className="space-y-3 rounded-2xl border p-4">
                    <div className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" />Start from the objective, not a tutorial page</div>
                    <p className="text-sm leading-6 text-muted-foreground">Tell the Practitioner what you are trying to accomplish or what you think the next step is. It can question your reasoning, give a progressive hint, explain a gap, or propose one real command when evidence is useful.</p>
                    <Button size="sm" variant="outline" disabled={!target || !!busy || paused} onClick={() => void ask('Guide me through Operation Black Domain. Ask me what I think before giving commands, and only reveal the next small step when I need help.')}>Begin guided investigation</Button>
                  </div>
                )}

                {entries.map((entry) => {
                  const sameTarget = target?.id === entry.operationNodeId;
                  const connectedForEntry = Boolean(terminalConnected[entry.operationNodeId]);
                  return (
                    <div key={entry.id} className="space-y-3">
                      <div className="ml-8 rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">{entry.prompt}</div>
                      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="font-semibold">{entry.plan.title}</p>{entry.targetLabel && <Badge variant="outline" className="text-[9px]">{entry.targetLabel}</Badge>}</div>
                        <p className="text-sm leading-6">{entry.plan.explanation}</p>
                        {entry.plan.objective && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Current objective:</span> {entry.plan.objective}</p>}

                        {entry.plan.command && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-xs font-medium"><Terminal className="h-3.5 w-3.5" />Proposed command</span><Badge variant={entry.plan.risk === 'changes-system' ? 'outline' : 'secondary'} className="text-[9px]">{entry.plan.risk}</Badge></div>
                            <pre className="oxsig-scrollbar overflow-x-auto rounded-xl border bg-black/90 p-3 text-xs text-white"><code>{entry.plan.command}</code></pre>
                            <p className="text-xs text-muted-foreground">Expected evidence: {entry.plan.expected}</p>
                            {!entry.execution && (
                              <Button className="w-full" disabled={!!busy || !sameTarget || !connectedForEntry || paused} onClick={() => void runCommand(entry)}>
                                {busy === `run:${entry.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                {!sameTarget ? `Select ${entry.targetLabel || 'planned machine'}` : !connectedForEntry ? `Open ${entry.targetLabel || 'machine'} Terminal` : 'Approve & run visibly'}
                              </Button>
                            )}
                            {entry.plan.risk === 'changes-system' && !entry.execution && <div className="flex items-start gap-2 text-xs text-amber-600"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{entry.plan.approvalReason}</span></div>}
                          </div>
                        )}

                        {entry.execution && (
                          <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                            <div className="flex items-center gap-2 text-xs font-semibold"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Real terminal evidence · exit {entry.execution.exitCode}</div>
                            <pre className="oxsig-scrollbar max-h-48 overflow-auto whitespace-pre-wrap text-[11px]"><code>{outputText(entry.execution)}</code></pre>
                            <p className="text-[10px] text-muted-foreground">Browser-observed · exact terminal session receipt {entry.execution.executionReceiptId?.slice(0, 8)}…</p>
                          </div>
                        )}

                        {entry.analysis && (
                          <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/[0.035] p-3">
                            <p className="text-xs font-semibold">What the evidence means</p>
                            <p className="text-sm leading-6">{entry.analysis.summary}</p>
                            <p className="text-xs leading-5 text-muted-foreground">{entry.analysis.interpretation}</p>
                            <p className="text-xs"><span className="font-semibold">Next:</span> {entry.analysis.nextStep}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {planBusy && <div className="flex items-center gap-2 rounded-xl border p-3 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Practitioner is choosing the smallest useful teaching move…</div>}
              </>
            )}
          </div>

          {!warRoom && (
            <div className="border-t bg-background p-3">
              {paused && <p className="mb-2 text-xs text-amber-600">Resume the Operation before continuing the guided session.</p>}
              <div className="flex items-end gap-2">
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value.slice(0, MAX_PROMPT_LENGTH))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (!busy && !paused && target) void ask();
                    }
                  }}
                  disabled={!!busy || historyLoading || paused}
                  placeholder="What do you think the next step is, or what do you need help understanding?"
                  className="min-h-[72px] resize-none"
                />
                <Button size="icon" className="h-10 w-10 shrink-0" disabled={!prompt.trim() || !!busy || historyLoading || !target || paused} onClick={() => void ask()} aria-label="Ask Operation Practitioner">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">{target ? `${coachingLabel(run?.mode)} · ${target.label} · commands require explicit approval and a connected terminal` : 'Loading target context…'}</p>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
