'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Box,
  FileText,
  Loader2,
  MessageCircle,
  Mic,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCollaborationRealtime } from '@/lib/collab/use-realtime';
import { getCsrfToken } from '@/lib/security/csrf-client';


type Collaboration = {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  ownerName: string;
  memberCount: number;
  lastMessage: string;
  lastMessageType: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
};

type Attachment = {
  key: string;
  filename: string;
  size: number;
  mimeType: string;
  uploadedBy?: string;
  createdAt?: string;
};

type CollaborationMessage = {
  id: string;
  collaborationId: string;
  text: string;
  type: 'text' | 'explain' | 'resource' | 'audio' | 'practice';
  metadata: Record<string, unknown>;
  createdAt: string;
  editedAt?: string | null;
  senderId: string;
  senderName: string;
  senderEmail?: string | null;
  senderAvatar?: string | null;
  isOwnMessage: boolean;
};

type Member = {
  id: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  role: string;
  isOwner: boolean;
};

type ComposerMode = 'text' | 'explain';

function formatTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDay(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatBytes(value?: number) {
  if (!value || value < 1) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function initials(value?: string | null) {
  const text = value?.trim() || 'O';
  const parts = text.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'O';
}

function attachmentFrom(metadata: Record<string, unknown>): Attachment | null {
  const value = metadata.attachment;
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Attachment>;
  if (!candidate.key || !candidate.filename || !candidate.mimeType || typeof candidate.size !== 'number') return null;
  return candidate as Attachment;
}

function lastMessagePreview(session: Collaboration) {
  if (session.lastMessage) return session.lastMessage;
  if (session.lastMessageType === 'audio') return 'Voice message';
  if (session.lastMessageType === 'resource') return 'Shared a resource';
  if (session.lastMessageType === 'practice') return 'Started practice';
  if (session.lastMessageType === 'explain') return 'Explanation';
  return session.description || 'Start the conversation';
}

export default function CollaborationWorkspace() {
  const [sessions, setSessions] = React.useState<Collaboration[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<CollaborationMessage[]>([]);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [canInvite, setCanInvite] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [conversationError, setConversationError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [composerMode, setComposerMode] = React.useState<ComposerMode>('text');
  const [newSessionName, setNewSessionName] = React.useState('');
  const [showNewSession, setShowNewSession] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviting, setInviting] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [recordSeconds, setRecordSeconds] = React.useState(0);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recordingStreamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const recordTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const activeIdRef = React.useRef<string | null>(null);
  const conversationRequestRef = React.useRef(0);

  const activeSession = sessions.find((session) => session.id === activeId) || null;

  const loadSessions = React.useCallback(async (silent = false) => {
    try {
      const response = await fetch('/api/collaborations', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load collaboration sessions');
      const next = (body.collaborations || []) as Collaboration[];
      setSessions(next);
      setActiveId((current) => {
        const nextId = current && next.some((session) => session.id === current) ? current : next[0]?.id || null;
        activeIdRef.current = nextId;
        return nextId;
      });
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : 'Could not load collaboration sessions');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadConversation = React.useCallback(async (id: string, silent = false) => {
    const requestId = ++conversationRequestRef.current;
    if (!silent) {
      setMessagesLoading(true);
      setConversationError(null);
    }
    try {
      const [messageResponse, memberResponse] = await Promise.all([
        fetch(`/api/collaborations/${id}/messages?limit=150`, { cache: 'no-store' }),
        fetch(`/api/collaborations/${id}/members`, { cache: 'no-store' }),
      ]);
      const [messageBody, memberBody] = await Promise.all([
        messageResponse.json().catch(() => ({})),
        memberResponse.json().catch(() => ({})),
      ]);
      if (!messageResponse.ok) throw new Error(messageBody.error || 'Could not load messages');
      if (!memberResponse.ok) throw new Error(memberBody.error || 'Could not load members');
      if (requestId !== conversationRequestRef.current || activeIdRef.current !== id) return;
      setMessages((messageBody.messages || []) as CollaborationMessage[]);
      setMembers((memberBody.members || []) as Member[]);
      setCanInvite(Boolean(memberBody.canInvite));
      setConversationError(null);
    } catch (error) {
      if (requestId !== conversationRequestRef.current || activeIdRef.current !== id) return;
      const message = error instanceof Error ? error.message : 'Could not load conversation';
      if (silent) console.warn('[oxsig] Collaboration reconciliation deferred:', error);
      else setConversationError(message);
    } finally {
      if (requestId === conversationRequestRef.current && activeIdRef.current === id) {
        setMessagesLoading(false);
      }
    }
  }, []);

  const realtimeCallbacks = React.useMemo(() => ({
    onMessageCreated: () => {
      if (!activeId) return;
      void loadConversation(activeId, true);
      void loadSessions(true);
    },
    onMembersChanged: () => {
      if (!activeId) return;
      void loadConversation(activeId, true);
      void loadSessions(true);
    },
    onSessionChanged: () => {
      if (!activeId) return;
      void loadConversation(activeId, true);
      void loadSessions(true);
    },
  }), [activeId, loadConversation, loadSessions]);

  const realtime = useCollaborationRealtime(activeId, realtimeCallbacks);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  React.useEffect(() => {
    activeIdRef.current = activeId;
    conversationRequestRef.current += 1;
    setMessages([]);
    setMembers([]);
    setCanInvite(false);
    setConversationError(null);
    setDraft('');
    setComposerMode('text');
    setInviteEmail('');

    if (!activeId) {
      setMessagesLoading(false);
      return;
    }

    void loadConversation(activeId);
  }, [activeId, loadConversation]);

  React.useEffect(() => {
    if (!activeId) return;
    // Realtime is the primary transport when configured. Keep a slow poll as a
    // reconciliation safety net; without Ably, preserve the existing fallback.
    const intervalMs = realtime.state === 'connected' ? 30_000 : 3500;
    const timer = window.setInterval(() => {
      void loadConversation(activeId, true);
      void loadSessions(true);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [activeId, loadConversation, loadSessions, realtime.state]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, activeId]);

  React.useEffect(() => () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const chooseSession = (id: string) => {
    if (id === activeId) return;
    if (recording) {
      toast.error('Stop the voice recording before switching sessions.');
      return;
    }
    activeIdRef.current = id;
    setActiveId(id);
  };

  const createSession = async () => {
    const name = newSessionName.trim();
    if (!name) return;
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/collaborations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ name }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not create session');
      const created = body.collaboration as Collaboration;
      setSessions((current) => [created, ...current]);
      activeIdRef.current = created.id;
      setActiveId(created.id);
      setNewSessionName('');
      setShowNewSession(false);
      toast.success('Collaboration session created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create session');
    }
  };

  const sendMessage = React.useCallback(async (
    text: string,
    type: CollaborationMessage['type'] = 'text',
    metadata: Record<string, unknown> = {}
  ) => {
    const targetId = activeId;
    if (!targetId) throw new Error('Choose a collaboration session first');
    const csrf = await getCsrfToken();
    const response = await fetch(`/api/collaborations/${targetId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({ text, type, metadata }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not send message');
    const message = body.message as CollaborationMessage;
    if (activeIdRef.current === targetId) {
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    }
    void loadSessions(true);
    return message;
  }, [activeId, loadSessions]);

  const submitDraft = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    try {
      await sendMessage(text, composerMode === 'explain' ? 'explain' : 'text');
      if (activeIdRef.current === activeId) {
        setDraft('');
        setComposerMode('text');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const uploadAttachment = React.useCallback(async (file: File, type: 'resource' | 'audio') => {
    if (!activeId) throw new Error('Choose a collaboration session first');
    const csrf = await getCsrfToken();
    const presign = await fetch(`/api/collaborations/${activeId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({
        filename: file.name,
        size: file.size,
        contentType: file.type || 'application/octet-stream',
      }),
    });
    const body = await presign.json().catch(() => ({}));
    if (!presign.ok) throw new Error(body.error || 'Could not prepare attachment upload');

    const form = new FormData();
    Object.entries(body.upload.fields as Record<string, string>).forEach(([key, value]) => form.append(key, value));
    form.append('file', file);
    const uploaded = await fetch(body.upload.url, { method: 'POST', body: form });
    if (!uploaded.ok) throw new Error('Attachment upload failed');

    const attachment = body.object as Attachment;
    await sendMessage(
      type === 'audio' ? 'Voice message' : file.name,
      type,
      { attachment }
    );
  }, [activeId, sendMessage]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await uploadAttachment(file, 'resource');
      toast.success(`${file.name} shared`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not share resource');
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    if (!activeId) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Audio recording is not supported by this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      setRecordSeconds(0);

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener('stop', () => {
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (!blob.size) return;
        const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
        setUploading(true);
        void uploadAttachment(file, 'audio')
          .then(() => toast.success('Voice message sent'))
          .catch((error) => toast.error(error instanceof Error ? error.message : 'Could not send voice message'))
          .finally(() => setUploading(false));
      });

      recorder.start(500);
      setRecording(true);
      recordTimerRef.current = setInterval(() => setRecordSeconds((value) => value + 1), 1000);
    } catch (error) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      toast.error(error instanceof Error ? error.message : 'Microphone access failed');
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const startPractice = async () => {
    if (!activeId || sending) return;
    setSending(true);
    try {
      await sendMessage('Practice session ready', 'practice', {
        href: '/labs',
        label: 'Open Cyber Lab',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add practice session');
    } finally {
      setSending(false);
    }
  };

  const inviteMember = async () => {
    if (!activeId || !inviteEmail.trim() || inviting) return;
    const targetId = activeId;
    setInviting(true);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/collaborations/${targetId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not add member');
      if (activeIdRef.current === targetId) setInviteEmail('');
      await loadConversation(targetId, true);
      await loadSessions(true);
      toast.success(body.message || `${body.member?.displayName || 'Member'} added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add member');
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[65vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 p-2 text-white shadow-sm">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Collaboration</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Conversation is the workspace. Explain, record, share resources, and start practice without leaving the session context.</p>
            </div>
          </div>
        </div>
        <Button onClick={() => setShowNewSession((value) => !value)}>
          <Plus className="mr-2 h-4 w-4" />New session
        </Button>
      </div>

      {showNewSession && (
        <div className="rounded-2xl border bg-card p-3 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newSessionName}
              onChange={(event) => setNewSessionName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void createSession(); }}
              placeholder="Session name, e.g. Network Security Study Group"
              aria-label="New collaboration session name"
              maxLength={80}
            />
            <div className="flex gap-2">
              <Button onClick={() => void createSession()} disabled={!newSessionName.trim()}>Create</Button>
              <Button variant="ghost" onClick={() => setShowNewSession(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid min-h-[680px] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[250px_minmax(0,1fr)_280px]">
        <aside className="border-b bg-muted/15 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Sessions</p>
              <p className="text-[11px] text-muted-foreground">{sessions.length} conversation{sessions.length === 1 ? '' : 's'}</p>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void loadSessions()} aria-label="Refresh sessions">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="max-h-48 space-y-1 overflow-auto p-2 lg:max-h-[610px]">
            {sessions.length === 0 ? (
              <button
                type="button"
                className="w-full rounded-xl border border-dashed p-5 text-left text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
                onClick={() => setShowNewSession(true)}
              >
                <Plus className="mb-2 h-5 w-5" />Create your first conversation.
              </button>
            ) : sessions.map((session) => {
              const active = session.id === activeId;
              return (
                <button
                  type="button"
                  key={session.id}
                  aria-pressed={active}
                  onClick={() => chooseSession(session.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-all duration-200 ${active ? 'border-primary/30 bg-gradient-to-r from-blue-500/10 to-purple-500/10 shadow-sm' : 'border-transparent hover:bg-muted/60'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{session.name}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatDay(session.lastMessageAt || session.updatedAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{lastMessagePreview(session)}</p>
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Users className="h-3 w-3" />{session.memberCount}
                    {session.isOwner && <Badge variant="outline" className="h-4 px-1 text-[8px]">Owner</Badge>}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col bg-background/50">
          {!activeSession ? (
            <div className="flex min-h-[520px] flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="rounded-2xl bg-muted p-4"><MessageCircle className="h-8 w-8 text-muted-foreground" /></div>
              <p className="mt-4 font-semibold">Start a collaboration session</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Create one conversation where messages, explanations, recordings, resources and practice stay together.</p>
              <Button className="mt-4" onClick={() => setShowNewSession(true)}><Plus className="mr-2 h-4 w-4" />New session</Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-semibold">{activeSession.name}</h2>
                    <Badge variant="secondary" className="text-[9px]">{activeSession.memberCount} member{activeSession.memberCount === 1 ? '' : 's'}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{activeSession.description || 'Shared conversation workspace'}</p>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${realtime.state === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {realtime.state === 'connected'
                    ? `Realtime · ${realtime.onlineCount} online`
                    : realtime.state === 'connecting'
                      ? 'Connecting realtime…'
                      : 'Polling fallback'}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-3 py-4 sm:px-5">
                {messagesLoading ? (
                  <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading conversation…</div>
                ) : conversationError ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center p-6 text-center">
                    <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-3 text-sm font-semibold">This conversation could not be loaded.</p>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{conversationError}</p>
                    <Button className="mt-4" size="sm" variant="outline" onClick={() => void loadConversation(activeSession.id)}><RefreshCw className="h-3.5 w-3.5" />Try again</Button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                    <Sparkles className="h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-3 text-sm font-semibold">The session is ready</p>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Send the first message, switch to Explain, record a voice note, attach a resource, or place a Cyber Lab practice card into the conversation.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((message) => {
                      const attachment = attachmentFrom(message.metadata);
                      const attachmentUrl = attachment && activeId
                        ? `/api/collaborations/${activeId}/attachments?key=${encodeURIComponent(attachment.key)}`
                        : null;
                      const practiceHref = typeof message.metadata.href === 'string' ? message.metadata.href : '/labs';
                      return (
                        <div key={message.id} className={`flex gap-2 ${message.isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                          {!message.isOwnMessage && (
                            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                              {initials(message.senderName)}
                            </div>
                          )}
                          <div className={`max-w-[88%] sm:max-w-[76%] ${message.isOwnMessage ? 'items-end' : 'items-start'} flex flex-col`}>
                            <div className="mb-1 flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
                              {!message.isOwnMessage && <span className="font-medium text-foreground">{message.senderName}</span>}
                              {message.type === 'explain' && <span className="flex items-center gap-1 text-primary"><Sparkles className="h-3 w-3" />Explain</span>}
                              <span>{formatTime(message.createdAt)}</span>
                            </div>
                            <div className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${message.isOwnMessage ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border bg-card'}`}>
                              {message.type === 'practice' ? (
                                <div className="min-w-[220px] space-y-2">
                                  <div className="flex items-center gap-2 font-semibold"><Box className="h-4 w-4" />Practice together</div>
                                  <p className={`text-xs ${message.isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{message.text || 'Open a temporary cloud lab and work through the task together.'}</p>
                                  <Button asChild size="sm" variant={message.isOwnMessage ? 'secondary' : 'outline'} className="h-8">
                                    <Link href={practiceHref}>Open Cyber Lab</Link>
                                  </Button>
                                </div>
                              ) : message.type === 'audio' && attachment && attachmentUrl ? (
                                <div className="min-w-[230px] space-y-2">
                                  <div className="flex items-center gap-2 font-medium"><Mic className="h-4 w-4" />Voice message</div>
                                  <audio controls preload="none" className="h-9 max-w-full" src={attachmentUrl} />
                                  <p className={`text-[10px] ${message.isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{formatBytes(attachment.size)}</p>
                                </div>
                              ) : message.type === 'resource' && attachment && attachmentUrl ? (
                                <div className="min-w-[220px] space-y-2">
                                  <div className="flex items-start gap-2">
                                    <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="truncate font-medium">{attachment.filename}</p>
                                      <p className={`text-[10px] ${message.isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{formatBytes(attachment.size)} · {attachment.mimeType}</p>
                                    </div>
                                  </div>
                                  <Button asChild size="sm" variant={message.isOwnMessage ? 'secondary' : 'outline'} className="h-8">
                                    <a href={`${attachmentUrl}&download=1`}>Open resource</a>
                                  </Button>
                                </div>
                              ) : (
                                <p className="whitespace-pre-wrap break-words leading-6">{message.text}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="border-t bg-background/90 p-3 backdrop-blur sm:p-4">
                {composerMode === 'explain' && (
                  <div className="mb-2 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                    <span className="flex items-center gap-2 font-medium"><Sparkles className="h-3.5 w-3.5 text-primary" />Explain mode — your next message is marked as an explanation.</span>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setComposerMode('text')}>Cancel</Button>
                  </div>
                )}
                <form onSubmit={(event) => void submitDraft(event)} className="space-y-2">
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void submitDraft();
                      }
                    }}
                    placeholder={composerMode === 'explain' ? 'Explain the idea, command, error, or concept to the group…' : `Message ${activeSession.name}…`}
                    className="min-h-[78px] resize-none bg-background"
                    maxLength={5000}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Button type="button" size="sm" variant={composerMode === 'explain' ? 'secondary' : 'ghost'} className="h-8" onClick={() => setComposerMode((mode) => mode === 'explain' ? 'text' : 'explain')}>
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />Explain
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        <Paperclip className="mr-1.5 h-3.5 w-3.5" />Attach
                      </Button>
                      <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => void handleFile(event)} />
                      <Button type="button" size="sm" variant={recording ? 'destructive' : 'ghost'} className="h-8" onClick={() => recording ? stopRecording() : void startRecording()} disabled={uploading}>
                        {recording ? <Square className="mr-1.5 h-3.5 w-3.5" /> : <Mic className="mr-1.5 h-3.5 w-3.5" />}
                        {recording ? `Stop ${recordSeconds}s` : 'Record'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => void startPractice()} disabled={sending}>
                        <Box className="mr-1.5 h-3.5 w-3.5" />Practice
                      </Button>
                      <Button asChild type="button" size="sm" variant="ghost" className="h-8">
                        <Link href="/collab/storyboards"><BookOpen className="mr-1.5 h-3.5 w-3.5" />Board</Link>
                      </Button>
                    </div>
                    <Button type="submit" size="sm" disabled={!draft.trim() || sending || uploading}>
                      {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                      Send
                    </Button>
                  </div>
                  {uploading && <p className="text-[10px] text-muted-foreground">Uploading and sharing with this session…</p>}
                </form>
              </div>
            </>
          )}
        </section>

        <aside className="border-t bg-muted/10 lg:border-l lg:border-t-0">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">Session</p>
            <p className="text-[11px] text-muted-foreground">People and shared actions</p>
          </div>
          {!activeSession ? (
            <div className="p-4 text-xs text-muted-foreground">Choose a session to see its people and tools.</div>
          ) : (
            <div className="space-y-5 p-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">People</p>
                  <Badge variant="outline" className="text-[9px]">{members.length}</Badge>
                </div>
                <div className="space-y-2">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center gap-2 rounded-xl border bg-background/70 p-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/15 to-purple-500/15 text-[10px] font-semibold">
                        {initials(member.displayName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{member.displayName}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{member.email || member.role}</p>
                      </div>
                      {member.isOwner && <Badge variant="secondary" className="text-[8px]">Owner</Badge>}
                    </div>
                  ))}
                </div>
              </div>

              {canInvite && (
                <div className="space-y-2 rounded-xl border bg-background/60 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium"><UserPlus className="h-3.5 w-3.5" />Add someone</div>
                  <Input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="member@example.com" type="email" className="h-9" aria-label="Member email" />
                  <Button size="sm" className="w-full" variant="outline" onClick={() => void inviteMember()} disabled={!inviteEmail.trim() || inviting}>
                    {inviting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}Add member
                  </Button>
                  <p className="text-[10px] leading-4 text-muted-foreground">Existing OXSIG users are added immediately. New users receive a secure email invitation when transactional email is configured.</p>
                </div>
              )}

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Conversation tools</p>
                <div className="grid gap-2">
                  <button type="button" onClick={() => setComposerMode('explain')} className="flex items-center gap-3 rounded-xl border bg-background/70 p-3 text-left transition hover:border-primary/30">
                    <Sparkles className="h-4 w-4 text-primary" /><div><p className="text-xs font-medium">Explain in chat</p><p className="text-[10px] text-muted-foreground">Keep the explanation in context.</p></div>
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 rounded-xl border bg-background/70 p-3 text-left transition hover:border-primary/30">
                    <Paperclip className="h-4 w-4" /><div><p className="text-xs font-medium">Attach resource</p><p className="text-[10px] text-muted-foreground">Share it with every member.</p></div>
                  </button>
                  <button type="button" onClick={() => void startPractice()} className="flex items-center gap-3 rounded-xl border bg-background/70 p-3 text-left transition hover:border-primary/30">
                    <Box className="h-4 w-4" /><div><p className="text-xs font-medium">Practice together</p><p className="text-[10px] text-muted-foreground">Place a lab card in the timeline.</p></div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
