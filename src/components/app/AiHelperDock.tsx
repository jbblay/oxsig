'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Bot, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { AiPractitionerPlan } from '@/lib/ai-practitioner/types';
import { getCsrfToken } from '@/lib/security/csrf-client';

type ChatLine = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type AiHelperOpenDetail = {
  prompt?: string;
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

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

export default function AiHelperDock() {
  const pathname = usePathname();
  const currentSurface = surfaceLabel(pathname);
  const [open, setOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState('');
  const [history, setHistory] = React.useState<ChatLine[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

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
      const modelHistory = [
        {
          role: 'assistant' as const,
          content: `OXSIG UI context: the user is currently working in ${currentSurface}. Be direct and action-oriented. Use this context only when it materially helps the request; do not explain OXSIG unless asked.`,
        },
        ...nextHistory.slice(-7).map(({ role, content }) => ({ role, content })),
      ];
      const response = await fetch('/api/ai/practitioner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': await getCsrfToken(),
        },
        body: JSON.stringify({
          action: 'plan',
          prompt: question,
          history: modelHistory,
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
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setOpen(false)} aria-label="Close AI Helper"><X className="h-4 w-4" /></Button>
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
        {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</div>}
      </div>

      <form
        className="border-t bg-background p-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
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
                void ask();
              }
            }}
            maxLength={MAX_PROMPT_LENGTH}
            placeholder={`Ask from ${currentSurface}…`}
            className="min-h-[48px] resize-none rounded-lg"
            disabled={historyLoading || busy}
          />
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!prompt.trim() || historyLoading || busy} aria-label="Send question">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </aside>
  );
}
