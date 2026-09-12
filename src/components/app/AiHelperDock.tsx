'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Bot, Loader2, RotateCcw, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { AiPractitionerPlan } from '@/lib/ai-practitioner/types';
import {
  aiRequestFailureLabel,
  classifyAiRequestError,
  clearAiRetrySnapshot,
  loadAiRetrySnapshot,
  readAiResponseError,
  saveAiRetrySnapshot,
  type AiRequestFailurePhase,
  type AiRequestPhase,
  type AiRetrySnapshot,
} from '@/lib/ai/client-request';
import { useAuth } from '@/lib/auth/use-auth';
import { getCsrfToken } from '@/lib/security/csrf-client';

type ChatLine = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type AiHelperOpenDetail = {
  prompt?: string;
};

type RequestState = {
  phase: AiRequestPhase;
  retry: AiRetrySnapshot | null;
  message?: string;
};

const MAX_PROMPT_LENGTH = 4000;

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function surfaceLabel(pathname: string) {
  if (pathname === '/home') return 'Dashboard';
  if (pathname.startsWith('/operations')) return 'Operations';
  if (pathname.startsWith('/warroom')) return 'WarRoom';
  if (pathname.startsWith('/vault') || pathname.startsWith('/storage')) return 'Vault';
  if (pathname.startsWith('/collab/storyboards')) return 'Boards';
  if (pathname.startsWith('/collab')) return 'Collaboration';
  if (pathname.startsWith('/live')) return 'Live Workspace';
  if (pathname.startsWith('/manage')) return 'Resources';
  if (pathname.startsWith('/account')) return 'Account';
  return 'OXSIG';
}

function recoveryMessage(phase: AiRequestFailurePhase) {
  if (phase === 'timed-out') return 'The AI request reached its time limit. Your prompt is preserved and can be retried.';
  if (phase === 'failed') return 'The previous AI request failed. Your prompt is preserved and can be retried.';
  return 'The previous request was interrupted before completion. Your prompt is ready to retry.';
}

export default function AiHelperDock() {
  const pathname = usePathname();
  const currentSurface = surfaceLabel(pathname);
  const { sessionIdentityId } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState('');
  const [history, setHistory] = React.useState<ChatLine[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [requestState, setRequestState] = React.useState<RequestState>({ phase: 'idle', retry: null });
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const mountedRef = React.useRef(true);
  const activeRequestRef = React.useRef<{
    attemptId: string;
    requestId: string;
    controller: AbortController;
    snapshot: AiRetrySnapshot;
  } | null>(null);

  const requestActive = requestState.phase === 'preparing' || requestState.phase === 'generating';

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!sessionIdentityId) return;
    let cancelled = false;
    const controller = new AbortController();

    const restoreRetry = (completedRequestIds: string[] = []) => {
      const recovered = loadAiRetrySnapshot(sessionIdentityId);
      const completed = new Set(completedRequestIds);
      if (recovered && completed.has(recovered.requestId)) {
        clearAiRetrySnapshot(sessionIdentityId);
        return;
      }
      if (!recovered) return;
      const phase = recovered.lastFailure ?? 'cancelled';
      setPrompt(recovered.prompt);
      setRequestState({ phase, retry: recovered, message: recoveryMessage(phase) });
    };

    void (async () => {
      try {
        const response = await fetch('/api/ai/practitioner', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw await readAiResponseError(response, 'AI history could not be loaded');
        const body = await response.json() as { history?: ChatLine[]; completedRequestIds?: string[] };
        if (cancelled) return;
        setHistory(Array.isArray(body.history) ? body.history : []);
        restoreRetry(Array.isArray(body.completedRequestIds) ? body.completedRequestIds : []);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('[oxsig] AI helper history restore failed:', error);
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
    const openHelper = (event: Event) => {
      const custom = event as CustomEvent<AiHelperOpenDetail>;
      const contextualPrompt = custom.detail?.prompt?.trim();
      if (contextualPrompt) setPrompt(contextualPrompt.slice(0, MAX_PROMPT_LENGTH));
      setOpen(true);
    };
    window.addEventListener('oxsig:ai-helper:open', openHelper);
    return () => window.removeEventListener('oxsig:ai-helper:open', openHelper);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      inputRef.current?.focus();
    }, 40);
  }, [requestState.phase, history, open]);

  function cancelActiveRequest() {
    const active = activeRequestRef.current;
    if (!active) return;
    activeRequestRef.current = null;
    active.controller.abort();
    const cancelledSnapshot: AiRetrySnapshot = {
      ...active.snapshot,
      createdAt: Date.now(),
      lastFailure: 'cancelled',
    };
    saveAiRetrySnapshot(sessionIdentityId, cancelledSnapshot);
    setPrompt(cancelledSnapshot.prompt);
    setRequestState({
      phase: 'cancelled',
      retry: cancelledSnapshot,
      message: recoveryMessage('cancelled'),
    });
  }

  async function runRequest(snapshot: AiRetrySnapshot) {
    if (activeRequestRef.current || historyLoading) return;

    const activeSnapshot: AiRetrySnapshot = {
      ...snapshot,
      createdAt: Date.now(),
      lastFailure: undefined,
    };
    const attemptId = uid();
    const controller = new AbortController();
    activeRequestRef.current = {
      attemptId,
      requestId: activeSnapshot.requestId,
      controller,
      snapshot: activeSnapshot,
    };
    saveAiRetrySnapshot(sessionIdentityId, activeSnapshot);
    setPrompt('');
    setHistory((current) => current.some((line) => line.id === activeSnapshot.userLineId)
      ? current
      : [...current, { id: activeSnapshot.userLineId, role: 'user', content: activeSnapshot.prompt }]);
    setRequestState({ phase: 'preparing', retry: activeSnapshot });

    const isCurrentAttempt = () => mountedRef.current
      && activeRequestRef.current?.attemptId === attemptId;

    try {
      const token = await getCsrfToken();
      if (!isCurrentAttempt() || controller.signal.aborted) return;
      setRequestState({ phase: 'generating', retry: activeSnapshot });

      const response = await fetch('/api/ai/practitioner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token,
        },
        signal: controller.signal,
        body: JSON.stringify({
          action: 'plan',
          requestId: activeSnapshot.requestId,
          prompt: activeSnapshot.prompt,
          history: activeSnapshot.history,
        }),
      });
      if (!response.ok) throw await readAiResponseError(response, 'AI Helper could not answer');
      const body = await response.json() as { plan?: Partial<AiPractitionerPlan> };
      if (typeof body.plan?.explanation !== 'string') {
        throw new Error('AI Helper returned an incomplete response');
      }
      if (!isCurrentAttempt() || controller.signal.aborted) return;

      setHistory((current) => [
        ...current,
        { id: uid(), role: 'assistant', content: body.plan!.explanation! },
      ]);
      clearAiRetrySnapshot(sessionIdentityId);
      setRequestState({ phase: 'completed', retry: null });
    } catch (error) {
      if (!isCurrentAttempt()) return;
      const phase = classifyAiRequestError(error, controller.signal);
      const failedSnapshot: AiRetrySnapshot = {
        ...activeSnapshot,
        createdAt: Date.now(),
        lastFailure: phase,
      };
      const message = phase === 'failed' && error instanceof Error
        ? error.message
        : recoveryMessage(phase);
      saveAiRetrySnapshot(sessionIdentityId, failedSnapshot);
      setPrompt(failedSnapshot.prompt);
      setRequestState({ phase, retry: failedSnapshot, message });
      if (phase !== 'cancelled') toast.error(message);
    } finally {
      if (activeRequestRef.current?.attemptId === attemptId) activeRequestRef.current = null;
    }
  }

  function ask(value = prompt) {
    const question = value.trim();
    if (!question || requestActive || activeRequestRef.current || historyLoading) return;
    if (question.length > MAX_PROMPT_LENGTH) {
      toast.error(`Keep the request under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`);
      return;
    }

    const previousRetry = requestState.retry;
    const baseHistory = previousRetry
      ? history.filter((line) => line.id !== previousRetry.userLineId)
      : history;
    const userLine: ChatLine = { id: uid(), role: 'user', content: question };
    const nextHistory = [...baseHistory, userLine];
    const modelHistory = [
      {
        role: 'assistant' as const,
        content: `OXSIG UI context: the user is currently working in ${currentSurface}. Be direct and action-oriented. Use this context only when it materially helps the request; do not explain OXSIG unless asked.`,
      },
      ...nextHistory.slice(-7).map(({ role, content }) => ({ role, content })),
    ];
    const snapshot: AiRetrySnapshot = {
      requestId: uid(),
      userLineId: userLine.id,
      prompt: question,
      history: modelHistory,
      createdAt: Date.now(),
    };

    setHistory(nextHistory);
    void runRequest(snapshot);
  }

  function retry() {
    if (!requestState.retry || requestActive || activeRequestRef.current) return;
    void runRequest(requestState.retry);
  }

  if (!open) return null;

  return (
    <aside className="fixed inset-x-1.5 bottom-1.5 top-[60px] z-50 flex flex-col overflow-hidden rounded-xl border bg-background/98 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-3 sm:top-[68px] sm:w-[430px]">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="h-4 w-4" /></span>
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold">AI Helper</h2>
            <Badge variant="outline" className="max-w-32 truncate text-[9px] font-normal">{currentSurface}</Badge>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            cancelActiveRequest();
            setOpen(false);
          }}
          aria-label="Close AI Helper"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="oxsig-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        {historyLoading ? (
          <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : history.length === 0 ? null : (
          history.map((line) => (
            <div key={line.id} className={`flex ${line.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-6 ${line.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border bg-card'}`}>
                {line.content}
              </div>
            </div>
          ))
        )}

        {requestActive && (
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />{requestState.phase === 'preparing' ? 'Preparing…' : 'Generating…'}</span>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={cancelActiveRequest}>Cancel</Button>
          </div>
        )}

        {!requestActive && requestState.retry && ['failed', 'timed-out', 'cancelled'].includes(requestState.phase) && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{aiRequestFailureLabel(requestState.phase)}</p>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={retry}>
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
            <p className="text-muted-foreground">{requestState.message}</p>
            <p className="line-clamp-2 text-muted-foreground"><span className="font-medium text-foreground">Prompt preserved:</span> {requestState.retry.prompt}</p>
          </div>
        )}
      </div>

      <form
        className="border-t bg-background p-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                ask();
              }
            }}
            maxLength={MAX_PROMPT_LENGTH}
            placeholder={`Ask from ${currentSurface}…`}
            className="min-h-[48px] resize-none rounded-lg"
            disabled={historyLoading || requestActive}
          />
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!prompt.trim() || historyLoading || requestActive} aria-label="Send question">
            {requestActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </aside>
  );
}
