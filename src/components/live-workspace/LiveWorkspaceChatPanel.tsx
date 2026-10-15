'use client';

import * as React from 'react';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Message = {
  id: string;
  senderName: string;
  senderId: string;
  createdAt: string;
  text: string;
  type: string;
  deleted?: boolean;
};

export default function LiveWorkspaceChatPanel({
  workspaceId,
  refreshToken,
  className = '',
}: {
  workspaceId: string;
  refreshToken: number;
  className?: string;
}) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [draft, setDraft] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const messagesRef = React.useRef<HTMLDivElement | null>(null);
  const load = React.useCallback(async () => {
    const response = await fetch(`/api/collaborations/${workspaceId}/messages?limit=100`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load workspace chat');
    const body = await response.json() as { messages?: Message[] };
    setMessages(body.messages || []);
    setError(null);
    setLoading(false);
  }, [workspaceId]);

  React.useEffect(() => {
    setMessages([]);
    setLoading(true);
    setError(null);
  }, [workspaceId]);

  React.useEffect(() => {
    let cancelled = false;
    void load().catch((cause) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : 'Chat unavailable');
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [load, refreshToken]);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load().catch(() => setError('Chat is reconnecting'));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  React.useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages.length]);

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/collaborations/${workspaceId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ text, type: 'text', clientMessageId: crypto.randomUUID() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Message could not be sent');
      }
      setDraft('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Message could not be sent');
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4" /> Chat</CardTitle>
        <CardDescription className="text-xs">Questions and messages stay with this workspace.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={messagesRef} aria-label="Workspace messages" role="log" aria-live="polite" className="max-h-[360px] min-h-[220px] space-y-3 overflow-y-auto rounded-lg border bg-muted/10 p-3">
          {loading && <p className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading messages…</p>}
          {!loading && messages.length === 0 && <p className="text-xs text-muted-foreground">No messages yet. Ask a question or say hello.</p>}
          {messages.filter((message) => !message.deleted).map((message) => (
            <div key={message.id} className="min-w-0">
              <p className="text-[11px] font-semibold">{message.senderName} <span className="font-normal text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></p>
              <p className="whitespace-pre-wrap break-words text-sm">{message.type === 'text' ? message.text : message.type === 'audio' ? 'Voice message (open Collaboration for playback)' : message.type === 'resource' ? 'Shared resource (open Collaboration for details)' : message.text}</p>
            </div>
          ))}
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <form className="space-y-2" onSubmit={(event) => void sendMessage(event)}>
          <label htmlFor="live-room-chat-message" className="sr-only">Write a workspace message</label>
          <Textarea id="live-room-chat-message" placeholder="Ask a question or share an idea…" rows={2} maxLength={5000} value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-[64px] resize-none" />
          <div className="flex justify-end">
            <Button size="sm" type="submit" disabled={!draft.trim() || sending}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
