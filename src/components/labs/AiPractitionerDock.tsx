'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Bot,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Play,
  Save,
  ShieldCheck,
  Sparkles,
  Terminal,
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
  execution?: AiPractitionerExecution;
  analysis?: AiPractitionerAnalysis;
};

type ChatLine = { id: string; role: 'user' | 'assistant'; content: string };

type VaultHandoff = {
  destination?: string;
  title?: string;
  summary?: string;
  body?: string;
  kind?: string;
  createdAt?: number;
};

const MAX_PROMPT_LENGTH = 4000;

async function csrfToken() {
  const response = await fetch('/api/csrf-token', { cache: 'no-store' });
  if (!response.ok) throw new Error('Secure request setup failed');
  return (await response.json()).token as string;
}

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function outputText(execution: AiPractitionerExecution) {
  const parts: string[] = [];
  if (execution.stdout.trim()) parts.push(execution.stdout.trim());
  if (execution.stderr.trim()) parts.push(`stderr:\n${execution.stderr.trim()}`);
  return parts.join('\n\n') || '(command returned no text output)';
}

export default function AiPractitionerDock() {
  const [open, setOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState('');
  const [instance, setInstance] = React.useState<LabInstance | null>(null);
  const [loadingLab, setLoadingLab] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [entries, setEntries] = React.useState<PlanEntry[]>([]);
  const [history, setHistory] = React.useState<ChatLine[]>([]);
  const [savedIds, setSavedIds] = React.useState<Set<string>>(() => new Set());
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const loadLab = React.useCallback(async () => {
    try {
      const response = await fetch('/api/labs', { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json();
      const current = (body.instances || [])[0] as LabInstance | undefined;
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
  }, [busy, entries, history, open]);

  const running = instance?.status === 'running';

  async function ask(value = prompt) {
    const question = value.trim();
    if (!question) return;
    if (question.length > MAX_PROMPT_LENGTH) {
      toast.error(`Keep the request under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`);
      return;
    }

    const id = uid();
    const nextUser: ChatLine = { id: uid(), role: 'user', content: question };
    const nextHistory = [...history, nextUser];
    setHistory(nextHistory);
    setPrompt('');
    setBusy(id);

    try {
      const token = await csrfToken();
      const response = await fetch('/api/ai/practitioner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({
          action: 'plan',
          labInstanceId: running ? instance?.id : undefined,
          prompt: question,
          history: nextHistory.slice(-8).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'AI Practitioner could not answer'));
      const body = await response.json() as { plan: AiPractitionerPlan };
      setEntries((current) => [...current, { id, prompt: question, plan: body.plan }]);
      setHistory((current) => [...current, { id: uid(), role: 'assistant', content: body.plan.explanation }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI Practitioner failed');
    } finally {
      setBusy(null);
    }
  }

  async function run(entry: PlanEntry) {
    if (!instance || !running || !entry.plan.command) {
      toast.error('Start a Cyber Lab machine before running a command.');
      return;
    }
    setBusy(`run:${entry.id}`);
    try {
      const token = await csrfToken();
      const response = await fetch(`/api/labs/instances/${instance.id}/ai/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ command: entry.plan.command, approved: true }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'The lab command could not run'));
      const body = await response.json() as { execution: AiPractitionerExecution };
      const execution = body.execution;
      setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, execution } : item));

      const analysisToken = await csrfToken();
      const analysisResponse = await fetch('/api/ai/practitioner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': analysisToken },
        body: JSON.stringify({
          action: 'explain',
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
      setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, execution, analysis: analysisBody.analysis } : item));
      setHistory((current) => [...current, { id: uid(), role: 'assistant', content: analysisBody.analysis.summary }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI Practitioner execution failed');
    } finally {
      setBusy(null);
    }
  }

  async function saveToVault(entry: PlanEntry) {
    if (!instance || !entry.execution || !entry.analysis) return;
    setBusy(`save:${entry.id}`);
    try {
      const token = await csrfToken();
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
          tags: ['ai-practitioner', 'cyber-lab', instance.slug].slice(0, 12),
          sourceType: 'lab',
          sourceId: instance.id,
          metadata: {
            aiPractitioner: true,
            exitCode: entry.execution.exitCode,
            risk: entry.execution.risk,
          },
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Could not save this lesson to Vault'));
      setSavedIds((current) => new Set(current).add(entry.id));
      toast.success('Real lab evidence saved to Vault.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save to Vault');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {!open && (
        <Button className="fixed bottom-5 right-5 z-40 h-12 rounded-full px-4 shadow-xl" onClick={() => setOpen(true)}>
          <Sparkles className="h-4 w-4" /> AI Practitioner
        </Button>
      )}

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
                    <Badge variant="secondary" className="text-[10px]">Ask → Approve → Run → Explain</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {loadingLab ? 'Checking Cyber Lab…' : running && instance ? `Chat ready · ${instance.name} ready for execution` : 'Chat ready · start a lab only when you want execution'}
                  </p>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close AI Practitioner">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div ref={scrollRef} className="oxsig-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {history.length === 0 && entries.length === 0 && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/25 p-4 text-sm leading-6">
                  <p className="font-medium">Ask first. Use the lab when you need evidence.</p>
                  <p className="mt-1 text-muted-foreground">AI Practitioner can answer normal questions without a running machine. When you ask it to inspect, test, or run something, it can propose one command for your approval and explain the real result.</p>
                </div>
                <div className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>Conversation never executes commands. Lab commands require an explicit click, run only on your authenticated active lab, and pass server-side command policy checks.</p>
                </div>
                <div className="space-y-2">
                  {[
                    'What is Nmap and when would I use it?',
                    'Explain Linux processes and systemd in simple terms.',
                    'Inspect networking on my running lab and explain what you find.',
                    'Run a safe system health check in my lab, then explain the output.',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm transition hover:bg-muted/40 disabled:opacity-50"
                      disabled={!!busy}
                      onClick={() => void ask(suggestion)}
                    >
                      <span>{suggestion}</span><ChevronRight className="h-4 w-4 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {history.filter((line) => line.role === 'user').map((line) => (
              <div key={line.id} className="ml-8 rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
                {line.content}
              </div>
            ))}

            {entries.map((entry) => (
              <div key={entry.id} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="font-semibold">{entry.plan.title}</p></div>
                  {entry.plan.command && <Badge variant={entry.plan.risk === 'changes-system' ? 'outline' : 'secondary'} className="text-[10px]">{entry.plan.risk}</Badge>}
                </div>
                <p className="text-sm leading-6">{entry.plan.explanation}</p>

                {entry.plan.command && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium"><Terminal className="h-3.5 w-3.5" /> Proposed command</div>
                    <pre className="oxsig-scrollbar overflow-x-auto rounded-xl border bg-black/90 p-3 text-xs text-white"><code>{entry.plan.command}</code></pre>
                    <p className="text-xs text-muted-foreground">Expected: {entry.plan.expected}</p>
                    {!entry.execution && (
                      <Button className="w-full" disabled={!!busy || !running} onClick={() => void run(entry)}>
                        {busy === `run:${entry.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        {running ? 'Approve & run in my lab' : 'Start a lab to run this command'}
                      </Button>
                    )}
                    {entry.plan.risk === 'changes-system' && !entry.execution && (
                      <div className="flex items-start gap-2 text-xs text-amber-600"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{entry.plan.approvalReason}</span></div>
                    )}
                  </div>
                )}

                {entry.execution && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between"><p className="text-xs font-medium">Real lab evidence</p><Badge variant="outline" className="text-[10px]">exit {entry.execution.exitCode}</Badge></div>
                    <pre className="oxsig-scrollbar max-h-52 overflow-auto rounded-xl border bg-muted/50 p-3 text-xs"><code>{outputText(entry.execution)}</code></pre>
                  </div>
                )}

                {entry.execution && !entry.analysis && busy === `run:${entry.id}` && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the evidence…</div>
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
            ))}

            {busy && !busy.startsWith('run:') && !busy.startsWith('save:') && (
              <div className="flex items-center gap-2 rounded-xl border p-3 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> AI Practitioner is thinking…</div>
            )}
          </div>

          <div className="border-t bg-background p-3">
            {!running && (
              <div className="mb-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">AI chat is available now. Start a Cyber Lab only when you want the practitioner to execute an approved command.</div>
            )}
            <div className="flex items-end gap-2">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (!busy) void ask();
                  }
                }}
                maxLength={MAX_PROMPT_LENGTH}
                placeholder="Ask a question, or ask me to run something in your lab…"
                className="min-h-[64px] resize-none"
                disabled={!!busy}
              />
              <Button size="icon" className="h-10 w-10 shrink-0" disabled={!!busy || !prompt.trim()} onClick={() => void ask()} aria-label="Ask AI Practitioner">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">AI can make mistakes. Oxsig requires explicit approval before lab execution and records practitioner activity for audit.</p>
          </div>
        </aside>
      )}
    </>
  );
}
