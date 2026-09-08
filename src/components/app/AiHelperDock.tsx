'use client';

import * as React from 'react';
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { AiPractitionerPlan } from '@/lib/ai-practitioner/types';
import { getCsrfToken } from '@/lib/security/csrf-client';

type ChatLine = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const MAX_PROMPT_LENGTH = 4000;

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

export default function AiHelperDock() {
  const [open, setOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState('');
  const [history, setHistory] = React.useState<ChatLine[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/ai/practitioner', { cache: 'no-store' });
        if (!response.ok) throw new Error(await apiError(response, 'AI history could not be loaded'));
        const body = await response.json() as { history?: ChatLine[] };
        if (!cancelled) setHistory(Array.isArray(body.history) ? body.history : []);
      } catch (error) {
        console.warn('[oxsig] AI helper history restore failed:', error);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 40);
  }, [busy, history, open]);

  async function ask(value = prompt) {
    const question = value.trim();
    if (!question || busy || historyLoading) return;
    if (question.length > MAX_PROMPT_LENGTH) {
      toast.error(`Keep the request under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`);
      return;
    }

    const userLine: ChatLine = { id: uid(), role: 'user', content: question };
    const nextHistory = [...history, userLine];
    setHistory(nextHistory);
    setPrompt('');
    setBusy(true);

    try {
      const response = await fetch('/api/ai/practitioner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': await getCsrfToken(),
        },
        body: JSON.stringify({
          action: 'plan',
          prompt: question,
          history: nextHistory.slice(-8).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, 'AI Helper could not answer'));
      const body = await response.json() as { plan: AiPractitionerPlan };
      setHistory((current) => [...current, { id: uid(), role: 'assistant', content: body.plan.explanation }]);
    } catch (error) {
      setHistory((current) => current.filter((line) => line.id !== userLine.id));
      setPrompt(question);
      toast.error(error instanceof Error ? error.message : 'AI Helper could not answer');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <Button className="fixed bottom-4 right-4 z-40 h-11 rounded-full px-4 shadow-xl sm:bottom-5 sm:right-5" onClick={() => setOpen(true)}>
          <Sparkles className="h-4 w-4" /> AI Helper
        </Button>
      )}

      {open && (
        <aside className="fixed inset-x-2 bottom-2 top-[66px] z-50 flex flex-col overflow-hidden rounded-2xl border bg-background/97 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-4 sm:top-[74px] sm:w-[430px]">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot className="h-4 w-4" /></span>
              <h2 className="truncate text-sm font-semibold">AI Helper</h2>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setOpen(false)} aria-label="Close AI Helper"><X className="h-4 w-4" /></Button>
          </div>

          <div ref={scrollRef} className="oxsig-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
            {historyLoading ? (
              <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
            ) : history.length === 0 ? (
              <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">Ask a question.</div>
            ) : (
              history.map((line) => (
                <div key={line.id} className={`flex ${line.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${line.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border bg-card'}`}>
                    {line.content}
                  </div>
                </div>
              ))
            )}
            {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</div>}
          </div>

          <form
            className="border-t bg-background p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            <div className="flex items-end gap-2">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void ask();
                  }
                }}
                maxLength={MAX_PROMPT_LENGTH}
                placeholder="Ask anything…"
                className="min-h-[54px] resize-none"
                disabled={historyLoading || busy}
              />
              <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!prompt.trim() || historyLoading || busy} aria-label="Send question">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </aside>
      )}
    </>
  );
}
