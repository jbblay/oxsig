'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Bot,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Volume2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type {
  AiPractitionerAnalysis,
  AiPractitionerExecution,
  AiPractitionerPlan,
} from '@/lib/ai-practitioner/types';
import {
  aiRequestFailureLabel,
  classifyAiRequestError,
  readAiResponseError,
  type AiRequestFailurePhase,
} from '@/lib/ai/client-request';
import { useAuth } from '@/lib/auth/use-auth';
import {
  AI_TERMINAL_QUERY_EVENT,
  AI_TERMINAL_RESULT_EVENT,
  AI_TERMINAL_RUN_EVENT,
  AI_TERMINAL_STATE_EVENT,
  type AiTerminalRunRequest,
  type AiTerminalRunResult,
  type AiTerminalState,
} from '@/lib/labs/ai-terminal-events';
import { getLabsSnapshot } from '@/lib/labs/client';
import { getCsrfToken } from '@/lib/security/csrf-client';
import { useOxsigVoiceInput } from '@/lib/voice/use-voice-input';
import { useOxsigVoicePlayback } from '@/lib/voice/use-voice-playback';

type LabInstance = {
  id: string;
  slug: string;
  name: string;
  status: string;
};

type PlanEntry = {
  id: string;
  prompt: string;
  plan: AiPractitionerPlan;
  labInstanceId?: string;
  execution?: AiPractitionerExecution;
  analysis?: AiPractitionerAnalysis;
};

type ChatLine = { id: string; role: 'user' | 'assistant'; content: string };

type PlanRetrySnapshot = {
  requestId: string;
  userLineId: string;
  prompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  labInstanceId?: string;
  createdAt: number;
  lastFailure?: AiRequestFailurePhase;
};

type PlanFailure = {
  phase: AiRequestFailurePhase;
  snapshot: PlanRetrySnapshot;
  message: string;
};

type VaultHandoff = {
  destination?: string;
  title?: string;
  summary?: string;
  body?: string;
  kind?: string;
  createdAt?: number;
};

const MAX_PROMPT_LENGTH = 4000;
const PLAN_RETRY_MAX_AGE_MS = 30 * 60 * 1000;

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function planRetryKey(identityId: string) {
  return `oxsig:ai-practitioner-retry:v1:${encodeURIComponent(identityId)}`;
}

function savePlanRetry(identityId: string | null, snapshot: PlanRetrySnapshot) {
  if (!identityId || typeof window === 'undefined') return;
  window.sessionStorage.setItem(planRetryKey(identityId), JSON.stringify(snapshot));
}

function clearPlanRetry(identityId: string | null) {
  if (!identityId || typeof window === 'undefined') return;
  window.sessionStorage.removeItem(planRetryKey(identityId));
}

function loadPlanRetry(identityId: string | null): PlanRetrySnapshot | null {
  if (!identityId || typeof window === 'undefined') return null;
  const key = planRetryKey(identityId);
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PlanRetrySnapshot>;
    if (
      typeof parsed.requestId !== 'string'
      || typeof parsed.userLineId !== 'string'
      || typeof parsed.prompt !== 'string'
      || !Array.isArray(parsed.history)
      || typeof parsed.createdAt !== 'number'
      || Date.now() - parsed.createdAt > PLAN_RETRY_MAX_AGE_MS
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    if (
      parsed.lastFailure !== undefined
      && parsed.lastFailure !== 'failed'
      && parsed.lastFailure !== 'timed-out'
      && parsed.lastFailure !== 'cancelled'
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed as PlanRetrySnapshot;
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

function planRecoveryMessage(phase: AiRequestFailurePhase) {
  if (phase === 'timed-out') return 'The AI request reached its time limit. Your prompt and lab context are preserved for retry.';
  if (phase === 'failed') return 'The AI request failed. Your prompt and lab context are preserved for retry.';
  return 'The AI request was interrupted. Your prompt and lab context are preserved for retry.';
}

function outputText(execution: AiPractitionerExecution) {
  const parts: string[] = [];
  if (execution.stdout.trim()) parts.push(execution.stdout.trim());
  if (execution.stderr.trim()) parts.push(`stderr:\n${execution.stderr.trim()}`);
  return parts.join('\n\n') || '(command returned no text output)';
}

function practitionerVoiceText(entry: PlanEntry) {
  const parts = [entry.plan.explanation];
  if (entry.analysis) {
    parts.push(
      `What actually happened. ${entry.analysis.summary}`,
      `Interpretation. ${entry.analysis.interpretation}`,
      `Next step. ${entry.analysis.nextStep}`
    );
  }
  return parts.join(' ');
}

function executeInVisibleTerminal(labInstanceId: string, command: string) {
  return new Promise<AiTerminalRunResult>((resolve, reject) => {
    const requestId = uid();
    const timeout = window.setTimeout(() => {
      window.removeEventListener(AI_TERMINAL_RESULT_EVENT, onResult);
      reject(new Error('The interactive terminal did not return the command result in time.'));
    }, 50_000);

    const onResult = (event: Event) => {
      const result = (event as CustomEvent<AiTerminalRunResult>).detail;
      if (!result || result.requestId !== requestId || result.labInstanceId !== labInstanceId) return;
      window.clearTimeout(timeout);
      window.removeEventListener(AI_TERMINAL_RESULT_EVENT, onResult);
      resolve(result);
    };

    window.addEventListener(AI_TERMINAL_RESULT_EVENT, onResult);
    window.dispatchEvent(new CustomEvent<AiTerminalRunRequest>(AI_TERMINAL_RUN_EVENT, {
      detail: { requestId, labInstanceId, command, surface: 'ai-practitioner' },
    }));
  });
}

export default function AiPractitionerDock() {
  const [open, setOpen] = React.useState(false);
  const { sessionIdentityId } = useAuth();

  React.useEffect(() => {
    const openPractitioner = () => setOpen(true);
    window.addEventListener('oxsig:ai-practitioner:open', openPractitioner);
    return () => window.removeEventListener('oxsig:ai-practitioner:open', openPractitioner);
  }, []);
  const [prompt, setPrompt] = React.useState('');
  const [instance, setInstance] = React.useState<LabInstance | null>(null);
  const [loadingLab, setLoadingLab] = React.useState(true);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [entries, setEntries] = React.useState<PlanEntry[]>([]);
  const [history, setHistory] = React.useState<ChatLine[]>([]);
  const [planFailure, setPlanFailure] = React.useState<PlanFailure | null>(null);
  const [savedIds, setSavedIds] = React.useState<Set<string>>(() => new Set());
  const [terminalConnected, setTerminalConnected] = React.useState(false);
  const activePlanRef = React.useRef<{
    attemptId: string;
    controller: AbortController;
    snapshot: PlanRetrySnapshot;
  } | null>(null);
  const { speakingKey, play: playVoice, stop: stopVoice } = useOxsigVoicePlayback();
  const voiceInput = useOxsigVoiceInput({
    onTranscript: ({ transcript }) => {
      setPrompt((current) => {
        const combined = current.trim() ? `${current.trim()} ${transcript}` : transcript;
        return combined.slice(0, MAX_PROMPT_LENGTH);
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => () => {
    activePlanRef.current?.controller.abort();
    activePlanRef.current = null;
  }, []);

  const loadLab = React.useCallback(async () => {
    try {
      const result = await getLabsSnapshot();
      if (!result.ok) return;
      const current = (result.data.instances || [])[0] as LabInstance | undefined;
      setInstance(current || null);
    } finally {
      setLoadingLab(false);
    }
  }, []);

  React.useEffect(() => {
    void loadLab();
    const timer = window.setInterval(() => void loadLab(), 7000);
    return () => window.clearInterval(timer);
  }, [loadLab]);

  React.useEffect(() => {
    if (!sessionIdentityId) return;
    let cancelled = false;
    const controller = new AbortController();
    setHistoryLoading(true);

    const restoreRetry = (completedRequestIds: string[] = []) => {
      const recovered = loadPlanRetry(sessionIdentityId);
      if (!recovered) return;
      if (completedRequestIds.includes(recovered.requestId)) {
        clearPlanRetry(sessionIdentityId);
        return;
      }
      const phase = recovered.lastFailure ?? 'cancelled';
      setPrompt(recovered.prompt);
      setPlanFailure({ phase, snapshot: recovered, message: planRecoveryMessage(phase) });
    };

    void (async () => {
      try {
        const response = await fetch('/api/ai/practitioner', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(await apiError(response, 'AI Practitioner history could not be loaded'));
        const body = await response.json() as { entries?: PlanEntry[]; history?: ChatLine[]; completedRequestIds?: string[] };
        if (cancelled) return;
        setEntries(Array.isArray(body.entries) ? body.entries : []);
        setHistory(Array.isArray(body.history) ? body.history : []);
        restoreRetry(Array.isArray(body.completedRequestIds) ? body.completedRequestIds : []);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('[oxsig] AI Practitioner durable history restore failed:', error);
          restoreRetry();
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionIdentityId]);

  React.useEffect(() => {
    const onTerminalState = (event: Event) => {
      const detail = (event as CustomEvent<AiTerminalState>).detail;
      if (!detail || detail.labInstanceId !== instance?.id) return;
      setTerminalConnected(detail.connected);
    };

    setTerminalConnected(false);
    window.addEventListener(AI_TERMINAL_STATE_EVENT, onTerminalState);
    window.dispatchEvent(new Event(AI_TERMINAL_QUERY_EVENT));
    return () => window.removeEventListener(AI_TERMINAL_STATE_EVENT, onTerminalState);
  }, [instance?.id]);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem('oxsig:vault-handoff');
      if (!raw) return;
      const handoff = JSON.parse(raw) as VaultHandoff;
      if (handoff.destination !== 'lab') return;
      if (handoff.createdAt && Date.now() - handoff.createdAt > 60 * 60 * 1000) return;
      const context = [handoff.title, handoff.summary, handoff.body].filter(Boolean).join('\n\n');
      if (!context) return;
      const prefill = `Help me understand and practice this Vault knowledge. Explain it first. If a running Cyber Lab is available and real execution would help, propose one safe command for my approval.\n\n${context}`;
      setPrompt(prefill.slice(0, MAX_PROMPT_LENGTH));
      setOpen(true);
      window.localStorage.removeItem('oxsig:vault-handoff');
    } catch {
      // Ignore stale handoff state.
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
  }, [busy, entries, history, open, planFailure]);

  const running = instance?.status === 'running';
  const planning = Boolean(busy?.startsWith('plan:'));
  const preparingPlan = Boolean(busy?.startsWith('plan:preparing:'));
  const pendingQuestion = planning && history.at(-1)?.role === 'user' ? history.at(-1)?.content : null;
  const voiceInputBusy = voiceInput.recording || voiceInput.processing || voiceInput.state === 'requesting-permission';

  function cancelPlan() {
    const active = activePlanRef.current;
    if (!active) return;
    activePlanRef.current = null;
    active.controller.abort();
    const snapshot: PlanRetrySnapshot = {
      ...active.snapshot,
      createdAt: Date.now(),
      lastFailure: 'cancelled',
    };
    savePlanRetry(sessionIdentityId, snapshot);
    setPrompt(snapshot.prompt);
    setPlanFailure({ phase: 'cancelled', snapshot, message: planRecoveryMessage('cancelled') });
    setBusy((current) => current?.startsWith('plan:') ? null : current);
  }

  async function executePlan(snapshot: PlanRetrySnapshot) {
    if (activePlanRef.current || busy || historyLoading) return;
    const activeSnapshot: PlanRetrySnapshot = {
      ...snapshot,
      createdAt: Date.now(),
      lastFailure: undefined,
    };
    const attemptId = uid();
    const controller = new AbortController();
    activePlanRef.current = { attemptId, controller, snapshot: activeSnapshot };
    savePlanRetry(sessionIdentityId, activeSnapshot);
    setPrompt('');
    setPlanFailure(null);
    setHistory((current) => current.some((line) => line.id === activeSnapshot.userLineId)
      ? current
      : [...current, { id: activeSnapshot.userLineId, role: 'user', content: activeSnapshot.prompt }]);
    setBusy(`plan:preparing:${attemptId}`);

    const isCurrentAttempt = () => activePlanRef.current?.attemptId === attemptId;

    try {
      const token = await getCsrfToken();
      if (!isCurrentAttempt() || controller.signal.aborted) return;
      setBusy(`plan:generating:${attemptId}`);
      const response = await fetch('/api/ai/practitioner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        signal: controller.signal,
        body: JSON.stringify({
          action: 'plan',
          requestId: activeSnapshot.requestId,
          labInstanceId: activeSnapshot.labInstanceId,
          prompt: activeSnapshot.prompt,
          history: activeSnapshot.history,
        }),
      });
      if (!response.ok) throw await readAiResponseError(response, 'AI Practitioner could not answer');
      const body = await response.json() as { plan?: AiPractitionerPlan; lab?: { id?: string } | null };
      if (!body.plan || typeof body.plan.explanation !== 'string') {
        throw new Error('AI Practitioner returned an incomplete response');
      }
      if (!isCurrentAttempt() || controller.signal.aborted) return;
      setEntries((current) => [...current, {
        id: activeSnapshot.requestId,
        prompt: activeSnapshot.prompt,
        plan: body.plan!,
        ...(body.lab?.id ? { labInstanceId: body.lab.id } : {}),
      }]);
      setHistory((current) => [...current, { id: uid(), role: 'assistant', content: body.plan!.explanation }]);
      clearPlanRetry(sessionIdentityId);
      setPlanFailure(null);
    } catch (error) {
      if (!isCurrentAttempt()) return;
      const phase = classifyAiRequestError(error, controller.signal);
      const failedSnapshot: PlanRetrySnapshot = {
        ...activeSnapshot,
        createdAt: Date.now(),
        lastFailure: phase,
      };
      const message = phase === 'failed' && error instanceof Error ? error.message : planRecoveryMessage(phase);
      savePlanRetry(sessionIdentityId, failedSnapshot);
      setPrompt(failedSnapshot.prompt);
      setPlanFailure({ phase, snapshot: failedSnapshot, message });
      if (phase !== 'cancelled') toast.error(message);
    } finally {
      if (activePlanRef.current?.attemptId === attemptId) activePlanRef.current = null;
      setBusy((current) => current?.includes(attemptId) ? null : current);
    }
  }

  function ask(value = prompt) {
    const question = value.trim();
    if (!question || historyLoading || busy || activePlanRef.current) return;
    if (question.length > MAX_PROMPT_LENGTH) {
      toast.error(`Keep the request under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`);
      return;
    }

    voiceInput.cancel();
    stopVoice();
    const baseHistory = planFailure
      ? history.filter((line) => line.id !== planFailure.snapshot.userLineId)
      : history;
    const nextUser: ChatLine = { id: uid(), role: 'user', content: question };
    const nextHistory = [...baseHistory, nextUser];
    const snapshot: PlanRetrySnapshot = {
      requestId: uid(),
      userLineId: nextUser.id,
      prompt: question,
      history: nextHistory.slice(-8).map(({ role, content }) => ({ role, content })),
      ...(running && instance?.id ? { labInstanceId: instance.id } : {}),
      createdAt: Date.now(),
    };
    setHistory(nextHistory);
    void executePlan(snapshot);
  }

  function retryPlan() {
    if (!planFailure || busy || activePlanRef.current) return;
    void executePlan(planFailure.snapshot);
  }

  async function run(entry: PlanEntry) {
    if (!instance || !running || !entry.plan.command) {
      toast.error('Start a Cyber Lab machine before running a command.');
      return;
    }
    if (entry.labInstanceId && entry.labInstanceId !== instance.id) {
      toast.error('This AI plan belongs to another lab session. Regenerate it in the current lab before execution.');
      return;
    }
    if (!terminalConnected) {
      toast.error('Open and connect the interactive terminal first. Approved AI commands now run visibly there.');
      return;
    }

    stopVoice();
    setBusy(`run:${entry.id}`);
    try {
      toast.info('Binding the approved command to the live terminal session and running it visibly…');
      const terminalResult = await executeInVisibleTerminal(instance.id, entry.plan.command);
      if (terminalResult.error) throw new Error(terminalResult.error);
      if (
        terminalResult.surface !== 'ai-practitioner' ||
        !terminalResult.executionId ||
        !terminalResult.evidenceId ||
        !terminalResult.executionReceiptId ||
        !terminalResult.terminalSessionId ||
        !terminalResult.provenance ||
        (terminalResult.risk !== 'read-only' && terminalResult.risk !== 'changes-system')
      ) {
        throw new Error('The terminal returned incomplete bound execution evidence.');
      }

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
      setEntries((current) => current.map((item) => item.id === entry.id
        ? { ...item, labInstanceId: instance.id, execution }
        : item));

      const analysisToken = await getCsrfToken();
      const analysisResponse = await fetch('/api/ai/practitioner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': analysisToken },
        body: JSON.stringify({
          action: 'explain',
          evidenceId: execution.evidenceId,
          labInstanceId: instance.id,
          prompt: entry.prompt,
          command: execution.command,
          stdout: execution.stdout,
          stderr: execution.stderr,
          exitCode: execution.exitCode,
        }),
      });
      if (!analysisResponse.ok) throw new Error(await apiError(analysisResponse, 'The command ran, but AI could not explain the result'));
      const analysisBody = await analysisResponse.json() as { analysis: AiPractitionerAnalysis };
      setEntries((current) => current.map((item) => item.id === entry.id
        ? { ...item, labInstanceId: instance.id, execution, analysis: analysisBody.analysis }
        : item));
      setHistory((current) => [...current, { id: uid(), role: 'assistant', content: analysisBody.analysis.summary }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI Practitioner execution failed');
    } finally {
      setBusy(null);
    }
  }

  async function saveToVault(entry: PlanEntry) {
    if (!entry.execution || !entry.analysis) return;
    const sourceLabId = entry.labInstanceId || instance?.id;
    if (!sourceLabId) {
      toast.error('The original lab binding for this evidence is unavailable.');
      return;
    }
    const sameActiveLab = instance?.id === sourceLabId;
    setBusy(`save:${entry.id}`);
    try {
      const token = await getCsrfToken();
      const body = [
        `Goal\n${entry.plan.objective}`,
        `Explanation\n${entry.plan.explanation}`,
        `Command\n${entry.execution.command}`,
        `Observed output\n${outputText(entry.execution)}`,
        `Interpretation\n${entry.analysis.interpretation}`,
        `Next step\n${entry.analysis.nextStep}`,
      ].join('\n\n');
      const response = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({
          kind: 'command',
          title: entry.plan.title.slice(0, 160),
          summary: entry.analysis.summary.slice(0, 500),
          body,
          language: null,
          tags: (sameActiveLab && instance
            ? ['ai-practitioner', 'cyber-lab', instance.slug]
            : ['ai-practitioner', 'cyber-lab']).slice(0, 12),
          sourceType: 'lab',
          sourceId: sourceLabId,
          metadata: {
            aiPractitioner: true,
            exitCode: entry.execution.exitCode,
            risk: entry.execution.risk,
            evidenceId: entry.execution.evidenceId,
            executionId: entry.execution.executionId,
            executionReceiptId: entry.execution.executionReceiptId,
            terminalSessionId: entry.execution.terminalSessionId,
            evidenceProvenance: entry.execution.provenance,
          },
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not save this lesson to Vault'));
      setSavedIds((current) => new Set(current).add(entry.id));
      toast.success('Bound real lab evidence saved to Vault.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save to Vault');
    } finally {
      setBusy(null);
    }
  }

  function toggleEntryVoice(entry: PlanEntry) {
    const key = `practitioner:${entry.id}`;
    if (speakingKey === key) {
      stopVoice();
      return;
    }

    void playVoice(practitionerVoiceText(entry), key).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error(error instanceof Error ? error.message : 'ElevenLabs voice playback failed');
    });
  }

  function toggleVoiceInput() {
    if (voiceInput.recording) {
      voiceInput.stop();
      return;
    }
    stopVoice();
    void voiceInput.start();
  }

  return (
    <>

      {open && (
        <aside className="fixed inset-x-2 bottom-2 top-[74px] z-50 flex flex-col overflow-hidden rounded-2xl border bg-background/97 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-4 sm:w-[460px]">
          <div className="border-b bg-gradient-to-r from-primary/10 via-background to-purple-500/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">AI Practitioner</h2>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {historyLoading
                      ? 'Restoring your practitioner history…'
                      : loadingLab
                        ? 'Checking Cyber Lab…'
                        : running && instance
                          ? terminalConnected
                            ? `Chat ready · ${instance.name} terminal connected`
                            : `Chat ready · ${instance.name} running · open terminal for execution`
                          : 'Chat ready · start a lab only when you want execution'}
                  </p>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { cancelPlan(); voiceInput.cancel(); stopVoice(); setOpen(false); }} aria-label="Close AI Practitioner">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div ref={scrollRef} className="oxsig-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {historyLoading && (
              <div className="flex items-center gap-2 rounded-xl border p-3 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Restoring your persisted AI Practitioner history…
              </div>
            )}


            {entries.map((entry) => (
              <div key={entry.id} className="space-y-3">
                <div className="ml-8 rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
                  {entry.prompt}
                </div>

                <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="font-semibold">{entry.plan.title}</p></div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant={speakingKey === `practitioner:${entry.id}` ? 'secondary' : 'ghost'}
                        className="h-7 w-7"
                        onClick={() => toggleEntryVoice(entry)}
                        title={speakingKey === `practitioner:${entry.id}` ? 'Stop voice' : 'Listen with ElevenLabs'}
                        aria-label={speakingKey === `practitioner:${entry.id}` ? 'Stop voice' : 'Listen with ElevenLabs'}
                      >
                        {speakingKey === `practitioner:${entry.id}` ? <Pause className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                      </Button>
                      {entry.plan.command && <Badge variant={entry.plan.risk === 'changes-system' ? 'outline' : 'secondary'} className="text-[10px]">{entry.plan.risk}</Badge>}
                    </div>
                  </div>
                  <p className="text-sm leading-6">{entry.plan.explanation}</p>

                  {entry.plan.command && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium"><Terminal className="h-3.5 w-3.5" /> Proposed command</div>
                      <pre className="oxsig-scrollbar overflow-x-auto rounded-xl border bg-black/90 p-3 text-xs text-white"><code>{entry.plan.command}</code></pre>
                      <p className="text-xs text-muted-foreground">Expected: {entry.plan.expected}</p>
                      {!entry.execution && (
                        <Button className="w-full" disabled={!!busy || !running || !terminalConnected} onClick={() => void run(entry)}>
                          {busy === `run:${entry.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                          {!running
                            ? 'Start a lab to run this command'
                            : !terminalConnected
                              ? 'Open terminal to run this command'
                              : 'Approve & run visibly in terminal'}
                        </Button>
                      )}
                      {running && !terminalConnected && !entry.execution && (
                        <p className="text-xs text-muted-foreground">Open the live machine terminal and wait for Connected. The approved command will execute there so you can watch the real output.</p>
                      )}
                      {entry.plan.risk === 'changes-system' && !entry.execution && (
                        <div className="flex items-start gap-2 text-xs text-amber-600"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{entry.plan.approvalReason}</span></div>
                      )}
                    </div>
                  )}

                  {entry.execution && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between"><p className="text-xs font-medium">Bound terminal evidence</p><Badge variant="outline" className="text-[10px]">exit {entry.execution.exitCode}</Badge></div>
                      <pre className="oxsig-scrollbar max-h-52 overflow-auto rounded-xl border bg-muted/50 p-3 text-xs"><code>{outputText(entry.execution)}</code></pre>
                      <p className="font-mono text-[10px] text-muted-foreground">browser-observed · evidence {entry.execution.evidenceId.slice(0, 8)}… · SSM {entry.execution.terminalSessionId.slice(0, 18)}…</p>
                    </div>
                  )}

                  {entry.execution && !entry.analysis && busy === `run:${entry.id}` && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the exact persisted terminal evidence…</div>
                  )}

                  {entry.analysis && (
                    <div className="space-y-3 border-t pt-3">
                      <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><p className="text-sm font-medium">What actually happened</p></div>
                      <p className="text-sm leading-6">{entry.analysis.summary}</p>
                      {entry.analysis.observations.length > 0 && (
                        <ul className="space-y-1.5 text-xs text-muted-foreground">
                          {entry.analysis.observations.map((item, index) => <li key={`${entry.id}-obs-${index}`}>• {item}</li>)}
                        </ul>
                      )}
                      <div className="rounded-xl bg-muted/50 p-3 text-xs leading-5"><span className="font-medium">Interpretation:</span> {entry.analysis.interpretation}</div>
                      <p className="text-xs"><span className="font-medium">Next:</span> {entry.analysis.nextStep}</p>
                      <Button variant="outline" className="w-full" disabled={!!busy || savedIds.has(entry.id)} onClick={() => void saveToVault(entry)}>
                        {busy === `save:${entry.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : savedIds.has(entry.id) ? <BookOpenCheck className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                        {savedIds.has(entry.id) ? 'Saved to Vault' : 'Capture this evidence in Vault'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {pendingQuestion && (
              <div className="ml-8 rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
                {pendingQuestion}
              </div>
            )}

            {planning && (
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {preparingPlan ? 'Preparing…' : 'Generating…'}</span>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={cancelPlan}>Cancel</Button>
              </div>
            )}

            {!planning && planFailure && (
              <div className="space-y-2 rounded-xl border bg-muted/30 p-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{aiRequestFailureLabel(planFailure.phase)}</p>
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={retryPlan}>
                    <RotateCcw className="h-3.5 w-3.5" /> Retry
                  </Button>
                </div>
                <p className="text-muted-foreground">{planFailure.message}</p>
                <p className="line-clamp-2 text-muted-foreground"><span className="font-medium text-foreground">Prompt preserved:</span> {planFailure.snapshot.prompt}</p>
              </div>
            )}
          </div>

          <div className="border-t bg-background p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (!busy && !voiceInputBusy && !historyLoading) ask();
                  }
                }}
                maxLength={MAX_PROMPT_LENGTH}
                placeholder={historyLoading ? 'Restoring your history…' : voiceInput.recording ? 'Listening… press stop when you are finished.' : voiceInput.processing ? 'Transcribing your question…' : 'Ask a question, or ask me to run something in your lab…'}
                className="min-h-[64px] resize-none"
                disabled={historyLoading || !!busy || voiceInputBusy}
              />
              <Button
                type="button"
                size="icon"
                variant={voiceInput.recording ? 'destructive' : 'outline'}
                className="h-10 w-10 shrink-0"
                disabled={historyLoading || !!busy || voiceInput.processing || voiceInput.state === 'requesting-permission' || !voiceInput.supported}
                onClick={toggleVoiceInput}
                title={voiceInput.recording ? 'Stop recording' : 'Speak your question'}
                aria-label={voiceInput.recording ? 'Stop recording' : 'Speak your question'}
              >
                {voiceInput.processing || voiceInput.state === 'requesting-permission'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : voiceInput.recording
                    ? <Square className="h-4 w-4" />
                    : <Mic className="h-4 w-4" />}
              </Button>
              <Button size="icon" className="h-10 w-10 shrink-0" disabled={historyLoading || !!busy || voiceInputBusy || !prompt.trim()} onClick={() => ask()} aria-label="Ask AI Practitioner">
                {busy || historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {voiceInput.recording
                ? 'Microphone active. Recording stops when you press stop or after 60 seconds.'
                : voiceInput.processing
                  ? 'ElevenLabs is transcribing. Review the text before you send it.'
                  : historyLoading
                    ? 'Loading your recent owner-scoped practitioner history from PostgreSQL.'
                    : 'Voice input is user-initiated and review-first. AI can make mistakes; lab execution still requires explicit approval.'}
            </p>
          </div>
        </aside>
      )}
    </>
  );
}
