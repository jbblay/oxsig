'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Bot,
  Box,
  ChevronDown,
  Check,
  Copy,
  FileText,
  Loader2,
  MessageCircle,
  Mic,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Square,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/use-auth';
import {
  readCollaborationDraft,
  writeCollaborationDraft,
} from '@/lib/collab/draft-storage';
import {
  collaborationScrollBehavior,
  isNearConversationBottom,
  newMessageDisposition,
} from '@/lib/collab/reading-state';
import { useCollaborationRealtime } from '@/lib/collab/use-realtime';
import { getCsrfToken } from '@/lib/security/csrf-client';
import { listServerStoryboards } from '@/lib/storyboards/api';
import type { StoryboardServerSession } from '@/lib/storyboards/types';

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

type SharedBoard = {
  id: string;
  title: string;
  href: string;
  permission: 'viewer';
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

function boardFrom(metadata: Record<string, unknown>): SharedBoard | null {
  const value = metadata.board;
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SharedBoard>;
  if (!candidate.id || !candidate.title || !candidate.href || candidate.permission !== 'viewer') return null;
  return candidate as SharedBoard;
}

function lastMessagePreview(session: Collaboration) {
  if (session.lastMessage) return session.lastMessage;
  if (session.lastMessageType === 'audio') return 'Voice message';
  if (session.lastMessageType === 'resource') return 'Shared resource';
  if (session.lastMessageType === 'practice') return 'Practice';
  if (session.lastMessageType === 'explain') return 'Explanation';
  return session.description || 'No messages';
}

function aiContext(messages: CollaborationMessage[]) {
  return messages
    .slice(-6)
    .filter((message) => message.text.trim())
    .map((message) => `${message.senderName}: ${message.text.trim()}`)
    .join('\n')
    .slice(0, 2200);
}

export default function CollaborationWorkspace() {
  const { sessionIdentityId } = useAuth();
  const [sessions, setSessions] = React.useState<Collaboration[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<CollaborationMessage[]>([]);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [canInvite, setCanInvite] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [conversationError, setConversationError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [hasNewMessages, setHasNewMessages] = React.useState(false);
  const [newSessionName, setNewSessionName] = React.useState('');
  const [showNewSession, setShowNewSession] = React.useState(false);
  const [showPeople, setShowPeople] = React.useState(false);
  const [selectedMemberId, setSelectedMemberId] = React.useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviting, setInviting] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [recordSeconds, setRecordSeconds] = React.useState(0);
  const [showBoards, setShowBoards] = React.useState(false);
  const [boards, setBoards] = React.useState<StoryboardServerSession[]>([]);
  const [boardsLoading, setBoardsLoading] = React.useState(false);
  const [boardQuery, setBoardQuery] = React.useState('');
  const [sharingBoardId, setSharingBoardId] = React.useState<string | null>(null);
  const [sessionQuery, setSessionQuery] = React.useState('');

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recordingStreamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const recordTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const activeIdRef = React.useRef<string | null>(null);
  const sessionIdentityRef = React.useRef<string | null>(sessionIdentityId);
  const conversationRequestRef = React.useRef(0);
  const nearBottomRef = React.useRef(true);
  const lastMessageIdRef = React.useRef<string | null>(null);

  const activeSession = sessions.find((session) => session.id === activeId) || null;
  const filteredSessions = React.useMemo(() => {
    const query = sessionQuery.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => `${session.name} ${session.description}`.toLowerCase().includes(query));
  }, [sessionQuery, sessions]);
  const ownerBoards = React.useMemo(() => {
    const query = boardQuery.trim().toLowerCase();
    return boards.filter((board) => board.permission === 'owner' && (!query || board.title.toLowerCase().includes(query)));
  }, [boards, boardQuery]);

  const scrollToLatest = React.useCallback(() => {
    const prefersReducedMotion = typeof window !== 'undefined'
      && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    messagesEndRef.current?.scrollIntoView({
      behavior: collaborationScrollBehavior(prefersReducedMotion),
      block: 'nearest',
    });
    nearBottomRef.current = true;
    setHasNewMessages(false);
  }, []);

  const handleMessagesScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const nearBottom = isNearConversationBottom(event.currentTarget);
    nearBottomRef.current = nearBottom;
    if (nearBottom) setHasNewMessages(false);
  }, []);

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
      if (requestId === conversationRequestRef.current && activeIdRef.current === id) setMessagesLoading(false);
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
    sessionIdentityRef.current = sessionIdentityId;
    setDraft(readCollaborationDraft(sessionIdentityId, activeId));
  }, [activeId, sessionIdentityId]);

  React.useEffect(() => {
    activeIdRef.current = activeId;
    conversationRequestRef.current += 1;
    setMessages([]);
    setMembers([]);
    setCanInvite(false);
    setConversationError(null);
    setHasNewMessages(false);
    nearBottomRef.current = true;
    lastMessageIdRef.current = null;
    setShowPeople(false);
    setSelectedMemberId(null);
    setInviteEmail('');
    setShowBoards(false);
    setBoardQuery('');

    if (!activeId) {
      setMessagesLoading(false);
      return;
    }
    void loadConversation(activeId);
  }, [activeId, loadConversation]);

  React.useEffect(() => {
    if (!activeId) return;
    const intervalMs = realtime.state === 'connected' ? 30_000 : 3500;
    const timer = window.setInterval(() => {
      void loadConversation(activeId, true);
      void loadSessions(true);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [activeId, loadConversation, loadSessions, realtime.state]);

  React.useEffect(() => {
    if (!activeId) return;
    const newestMessage = messages.at(-1) || null;
    if (newestMessage && newestMessage.collaborationId !== activeId) return;

    const disposition = newMessageDisposition(
      lastMessageIdRef.current,
      newestMessage?.id || null,
      nearBottomRef.current
    );
    lastMessageIdRef.current = newestMessage?.id || null;

    if (disposition === 'follow') scrollToLatest();
    else if (disposition === 'announce') setHasNewMessages(true);
  }, [activeId, messages, scrollToLatest]);

  React.useEffect(() => () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const chooseSession = (id: string) => {
    if (recording) {
      toast.error('Stop recording before switching sessions.');
      return;
    }
    setShowPeople(false);
    activeIdRef.current = id;
    setActiveId(id);
  };

  const showSessions = () => {
    if (recording) {
      toast.error('Stop recording before switching sessions.');
      return;
    }
    activeIdRef.current = null;
    setActiveId(null);
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
      toast.success('Session created.');
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
    const targetId = activeId;
    const targetIdentity = sessionIdentityId;
    if (!text || !targetId || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await sendMessage(text);
      writeCollaborationDraft(targetIdentity, targetId, '');
      if (activeIdRef.current === targetId && sessionIdentityRef.current === targetIdentity) setDraft('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send message';
      setSendError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const copyMessage = async (message: CollaborationMessage) => {
    if (!message.text.trim()) return;
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? null : current), 1500);
    } catch {
      toast.error('Could not copy message');
    }
  };

  const openAiHelper = React.useCallback((prompt?: string) => {
    window.dispatchEvent(new CustomEvent('oxsig:ai-helper:open', {
      detail: prompt ? { prompt } : {},
    }));
  }, []);

  const explainCurrent = () => {
    const source = draft.trim() || [...messages].reverse().find((message) => message.text.trim())?.text.trim();
    if (!source) {
      toast.error('Write something or add a message first, then Explain can work on real context.');
      return;
    }
    openAiHelper(`Explain this clearly for the people in the current collaboration. Focus on what it means, why it matters, and one practical example.\n\n${source}`);
  };

  const askCurrent = () => {
    const context = aiContext(messages);
    const prompt = draft.trim()
      ? `Help me with this question in the context of the current collaboration:\n\n${draft.trim()}${context ? `\n\nRecent collaboration context:\n${context}` : ''}`
      : context
        ? `Help me reason about the current collaboration. Start from this recent context and ask me what I want to solve if the goal is ambiguous:\n\n${context}`
        : undefined;
    openAiHelper(prompt);
  };

  const startPractice = () => {
    const context = aiContext(messages);
    if (!context && !draft.trim()) {
      toast.error('Add some technical context first so Practice has something real to test.');
      return;
    }
    openAiHelper(`Run a short interactive practice test based on this collaboration. Ask exactly one question at a time. Wait for my answer, judge it, explain what I missed, then continue with the next question. Do not give the answer before I attempt it.\n\nPractice context:\n${draft.trim() || context}`);
  };

  const uploadAttachment = React.useCallback(async (file: File, type: 'resource' | 'audio') => {
    if (!activeId) throw new Error('Choose a collaboration session first');
    const targetId = activeId;
    const csrf = await getCsrfToken();
    const presign = await fetch(`/api/collaborations/${targetId}/attachments`, {
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

    const makeForm = () => {
      const form = new FormData();
      Object.entries(body.upload.fields as Record<string, string>).forEach(([key, value]) => form.append(key, value));
      form.append('file', file);
      return form;
    };

    try {
      const uploaded = await fetch(body.upload.url, { method: 'POST', body: makeForm() });
      if (!uploaded.ok) throw new Error(`Storage rejected the attachment (${uploaded.status})`);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      try {
        await fetch(body.upload.url, { method: 'POST', body: makeForm(), mode: 'no-cors' });
      } catch {
        throw new Error('Could not reach attachment storage. Check the storage endpoint and bucket CORS policy.');
      }
    }

    const attachment = body.object as Attachment;
    const verify = await fetch(
      `/api/collaborations/${targetId}/attachments?key=${encodeURIComponent(attachment.key)}&verify=1`,
      { cache: 'no-store' }
    );
    if (!verify.ok) {
      const verifyBody = await verify.json().catch(() => ({}));
      throw new Error(verifyBody.error || 'Attachment upload could not be verified');
    }

    await sendMessage(type === 'audio' ? 'Voice message' : file.name, type, { attachment });
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

  const openBoardPicker = async () => {
    if (!activeId || boardsLoading) return;
    setShowBoards(true);
    setBoardsLoading(true);
    try {
      const next = await listServerStoryboards();
      setBoards(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load Boards');
    } finally {
      setBoardsLoading(false);
    }
  };

  const shareBoard = async (board: StoryboardServerSession) => {
    if (!activeId || sharingBoardId) return;
    if (board.permission !== 'owner') {
      toast.error('Only a Board you own can be granted to everyone in this collaboration.');
      return;
    }
    setSharingBoardId(board.id);
    try {
      const csrf = await getCsrfToken();
      const recipients = [...new Set(members.map((member) => member.email?.trim().toLowerCase()).filter((email): email is string => Boolean(email)))];
      const grantResults = await Promise.all(recipients.map(async (email) => {
        const response = await fetch(`/api/storyboards/${board.id}/shares`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify({ email, permission: 'viewer' }),
        });
        if (response.ok || response.status === 409) return null;
        const body = await response.json().catch(() => ({}));
        return body.error || `Could not grant Board access to ${email}`;
      }));
      const failure = grantResults.find((result): result is string => Boolean(result));
      if (failure) throw new Error(failure);

      const shared: SharedBoard = {
        id: board.id,
        title: board.title,
        href: `/collab/storyboards?session=${encodeURIComponent(board.id)}`,
        permission: 'viewer',
      };
      await sendMessage(`Shared Board: ${board.title}`, 'text', { board: shared });
      setShowBoards(false);
      setBoardQuery('');
      toast.success('Board shared with the collaboration.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not share Board');
    } finally {
      setSharingBoardId(null);
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
    return <div className="flex min-h-0 flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col">
      {!activeSession ? (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-3 sm:px-4">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold">Sessions</h1>
              <Badge variant="outline" className="text-[9px]">{sessions.length}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void loadSessions()} aria-label="Refresh sessions">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" className="h-8" onClick={() => setShowNewSession(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />New session
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {sessions.length === 0 ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
                <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium">No collaboration sessions</p>
                <Button className="mt-4" size="sm" onClick={() => setShowNewSession(true)}><Plus className="mr-1.5 h-3.5 w-3.5" />New session</Button>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sessions.map((session) => (
                  <button
                    type="button"
                    key={session.id}
                    onClick={() => chooseSession(session.id)}
                    className="rounded-xl border bg-background p-4 text-left transition hover:border-primary/35 hover:bg-muted/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold">{session.name}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{formatDay(session.lastMessageAt || session.updatedAt)}</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{lastMessagePreview(session)}</p>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Users className="h-3 w-3" />{session.memberCount}
                      {session.isOwner && <Badge variant="outline" className="h-4 px-1 text-[8px]">Owner</Badge>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
          <aside className="hidden w-72 shrink-0 flex-col border-r bg-muted/15 lg:flex" aria-label="Collaboration sessions">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Messages</p>
                <p className="text-[10px] text-muted-foreground">Your collaboration spaces</p>
              </div>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowNewSession(true)} aria-label="New collaboration session">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="border-b p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" className="h-9 bg-background pl-8 text-xs" />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredSessions.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">No conversations match.</p>
              ) : filteredSessions.map((session) => (
                <button type="button" key={session.id} onClick={() => chooseSession(session.id)} className={`mb-1 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition ${session.id === activeId ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60'}`} aria-current={session.id === activeId ? 'page' : undefined}>
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{initials(session.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold">{session.name}</span><span className="shrink-0 text-[9px] text-muted-foreground">{formatDay(session.lastMessageAt || session.updatedAt)}</span></span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{lastMessagePreview(session)}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t p-3 text-[10px] text-muted-foreground">
              <div className="flex items-center justify-between"><span>{sessions.length} conversation{sessions.length === 1 ? '' : 's'}</span><span className="flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${realtime.state === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />{realtime.state === 'connected' ? 'Live' : 'Reconnecting'}</span></div>
            </div>
          </aside>
          <main className="flex min-w-0 min-h-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center gap-2 border-b bg-background/70 px-3 py-2.5 sm:px-4">
            <Button type="button" size="sm" variant="ghost" className="h-8" onClick={showSessions}>
              <MessageCircle className="mr-1.5 h-3.5 w-3.5" />Sessions
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-sm font-semibold">{activeSession.name}</h1>
                <Badge variant="secondary" className="text-[9px]">{activeSession.memberCount}</Badge>
              </div>
              {activeSession.description && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{activeSession.description}</p>}
            </div>
            <button type="button" onClick={() => setShowPeople(true)} className="hidden items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] text-muted-foreground transition hover:bg-muted sm:flex">
              <span className={`h-2 w-2 rounded-full ${realtime.state === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {realtime.state === 'connected' ? `${realtime.onlineCount} online` : realtime.state === 'connecting' ? 'Connecting…' : 'Fallback'}
            </button>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setShowPeople(true)}>
              <Users className="mr-1.5 h-3.5 w-3.5" />People
            </Button>
            <Button type="button" size="sm" className="h-8" onClick={() => setShowNewSession(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />New
            </Button>
          </header>

          <div className="relative min-h-0 flex-1">
            <div
              className="h-full min-h-0 overflow-y-auto px-3 py-4 sm:px-5"
              role="region"
              aria-label="Conversation messages"
              onScroll={handleMessagesScroll}
            >
              {messagesLoading ? (
                <div className="flex min-h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
              ) : conversationError ? (
                <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
                  <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-3 text-sm font-semibold">Could not load conversation</p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{conversationError}</p>
                  <Button className="mt-4" size="sm" variant="outline" onClick={() => void loadConversation(activeSession.id)}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry</Button>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex min-h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
                  <MessageCircle className="mb-2 h-8 w-8 opacity-40" />
                  <p className="font-medium text-foreground">Start the conversation</p>
                  <p className="mt-1 max-w-sm text-xs">Ask, explain, test an idea, attach evidence, or send a Board without leaving the session.</p>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-4xl space-y-3">
                  {messages.map((message) => {
                    const attachment = attachmentFrom(message.metadata);
                    const sharedBoard = boardFrom(message.metadata);
                    const attachmentUrl = attachment && activeId
                      ? `/api/collaborations/${activeId}/attachments?key=${encodeURIComponent(attachment.key)}`
                      : null;
                    const practiceHref = typeof message.metadata.href === 'string' ? message.metadata.href : '/labs';
                    return (
                      <div key={message.id} className={`flex gap-2 ${message.isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                        {!message.isOwnMessage && (
                          <div className="relative mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                            {initials(message.senderName)}
                            {realtime.onlineIds.includes(message.senderId) && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />}
                          </div>
                        )}
                        <div className={`flex max-w-[88%] flex-col sm:max-w-[76%] ${message.isOwnMessage ? 'items-end' : 'items-start'}`}>
                          <div className="mb-1 flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
                            {!message.isOwnMessage && <span className="font-medium text-foreground">{message.senderName}</span>}
                            {message.type === 'explain' && <span className="flex items-center gap-1 text-primary"><Sparkles className="h-3 w-3" />Explain</span>}
                            <span>{formatTime(message.createdAt)}</span>
                          </div>
                          <div className="group relative">
                          <div className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${message.isOwnMessage ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border bg-card'}`}>
                            {sharedBoard ? (
                              <div className="min-w-[220px] space-y-2.5">
                                <div className="flex items-start gap-2">
                                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
                                  <div className="min-w-0"><p className="text-[10px] uppercase tracking-wide opacity-70">Shared Board</p><p className="truncate font-semibold">{sharedBoard.title}</p></div>
                                </div>
                                <Button asChild size="sm" variant={message.isOwnMessage ? 'secondary' : 'outline'} className="h-8 w-full"><Link href={sharedBoard.href}>Open Board</Link></Button>
                              </div>
                            ) : message.type === 'practice' ? (
                              <div className="min-w-[200px] space-y-2">
                                <div className="flex items-center gap-2 font-semibold"><Box className="h-4 w-4" />Practice</div>
                                {message.text && <p className={`text-xs ${message.isOwnMessage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{message.text}</p>}
                                <Button asChild size="sm" variant={message.isOwnMessage ? 'secondary' : 'outline'} className="h-8"><Link href={practiceHref}>Open Cyber Lab</Link></Button>
                              </div>
                            ) : message.type === 'audio' && attachment && attachmentUrl ? (
                              <div className="min-w-[210px] space-y-2">
                                <div className="flex items-center gap-2 font-medium"><Mic className="h-4 w-4" />Voice message</div>
                                <audio controls preload="none" className="h-9 max-w-full" src={attachmentUrl} />
                                <p className={`text-[10px] ${message.isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{formatBytes(attachment.size)}</p>
                              </div>
                            ) : message.type === 'resource' && attachment && attachmentUrl ? (
                              <div className="min-w-[200px] space-y-2">
                                <div className="flex items-start gap-2">
                                  <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                                  <div className="min-w-0"><p className="truncate font-medium">{attachment.filename}</p><p className={`text-[10px] ${message.isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{formatBytes(attachment.size)} · {attachment.mimeType}</p></div>
                                </div>
                                <Button asChild size="sm" variant={message.isOwnMessage ? 'secondary' : 'outline'} className="h-8"><a href={`${attachmentUrl}&download=1`}>Open</a></Button>
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap break-words leading-6">{message.text}</p>
                            )}
                          </div>
                          {message.text.trim() && (
                            <button type="button" onClick={() => void copyMessage(message)} className={`absolute -bottom-3 ${message.isOwnMessage ? 'left-1' : 'right-1'} hidden h-6 items-center gap-1 rounded-md border bg-card px-1.5 text-[9px] text-muted-foreground shadow-sm group-hover:flex`} aria-label={`Copy message from ${message.senderName}`}>
                              {copiedMessageId === message.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}{copiedMessageId === message.id ? 'Copied' : 'Copy'}
                            </button>
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
            {hasNewMessages && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="pointer-events-auto h-8 rounded-full border shadow-md"
                  onClick={scrollToLatest}
                >
                  <ChevronDown className="mr-1.5 h-3.5 w-3.5" />New messages
                </Button>
              </div>
            )}
          </div>

          <div className="border-t bg-background/90 p-2.5 backdrop-blur sm:p-3">
            <form onSubmit={(event) => void submitDraft(event)} className="mx-auto w-full max-w-4xl space-y-2">
              <Textarea
                value={draft}
                onChange={(event) => {
                  const nextDraft = event.target.value;
                  setDraft(nextDraft);
                  writeCollaborationDraft(sessionIdentityId, activeId, nextDraft);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submitDraft();
                  }
                }}
                placeholder={`Message ${activeSession.name}…`}
                className="min-h-[64px] resize-none bg-background"
                maxLength={5000}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" className="h-8" onClick={explainCurrent}><Sparkles className="mr-1.5 h-3.5 w-3.5" />Explain</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8" onClick={askCurrent}><Bot className="mr-1.5 h-3.5 w-3.5" />Ask</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => fileInputRef.current?.click()} disabled={uploading}><Paperclip className="mr-1.5 h-3.5 w-3.5" />Attach</Button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => void handleFile(event)} />
                  <Button type="button" size="sm" variant={recording ? 'destructive' : 'ghost'} className="h-8" onClick={() => recording ? stopRecording() : void startRecording()} disabled={uploading}>
                    {recording ? <Square className="mr-1.5 h-3.5 w-3.5" /> : <Mic className="mr-1.5 h-3.5 w-3.5" />}{recording ? `Stop ${recordSeconds}s` : 'Record'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8" onClick={startPractice}><Box className="mr-1.5 h-3.5 w-3.5" />Practice</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => void openBoardPicker()}><BookOpen className="mr-1.5 h-3.5 w-3.5" />Board</Button>
                </div>
                <Button type="submit" size="sm" disabled={!draft.trim() || sending || uploading}>
                  {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}Send
                </Button>
              </div>
              {sendError && <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[10px] text-destructive"><span>Message not sent. Your draft is saved and ready to retry.</span><Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => void submitDraft()} disabled={sending}>Retry</Button></div>}
              {uploading && <p className="text-[10px] text-muted-foreground">Uploading and verifying attachment…</p>}
            </form>
          </div>
          </main>
        </section>
      )}

      {showNewSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowNewSession(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="new-collaboration-title" className="w-full max-w-md rounded-xl border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="new-collaboration-title" className="text-sm font-semibold">New session</h2>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowNewSession(false)} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>
            <Input
              autoFocus
              value={newSessionName}
              onChange={(event) => setNewSessionName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void createSession(); }}
              placeholder="Session name"
              aria-label="New collaboration session name"
              maxLength={80}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNewSession(false)}>Cancel</Button>
              <Button onClick={() => void createSession()} disabled={!newSessionName.trim()}>Create</Button>
            </div>
          </div>
        </div>
      )}

      {showBoards && activeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowBoards(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="share-board-title" className="flex max-h-[75vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div><h2 id="share-board-title" className="text-sm font-semibold">Send a Board</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Choose one Board you own. Collaboration members receive viewer access before the card is sent.</p></div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowBoards(false)} aria-label="Close Board picker"><X className="h-4 w-4" /></Button>
            </div>
            <div className="border-b p-3">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={boardQuery} onChange={(event) => setBoardQuery(event.target.value)} placeholder="Find a Board…" className="h-9 pl-9" /></div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {boardsLoading ? (
                <div className="flex min-h-40 items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading Boards…</div>
              ) : ownerBoards.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center text-center"><BookOpen className="h-7 w-7 text-muted-foreground/40" /><p className="mt-2 text-sm font-medium">No matching owned Boards</p><p className="mt-1 text-xs text-muted-foreground">Create or save a Board first, then send it from here.</p></div>
              ) : (
                <div className="space-y-2">
                  {ownerBoards.map((board) => (
                    <button key={board.id} type="button" onClick={() => void shareBoard(board)} disabled={Boolean(sharingBoardId)} className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-muted/20 disabled:opacity-60">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><BookOpen className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{board.title}</span><span className="block text-[10px] text-muted-foreground">Updated {formatDay(board.updatedAt)} · {board.status}</span></span>
                      {sharingBoardId === board.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPeople && activeSession && (
        <div className="fixed inset-0 z-50 bg-background/55 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowPeople(false); }}>
          <aside role="dialog" aria-modal="true" aria-label="People" className="absolute bottom-3 right-3 top-3 flex w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-xl sm:bottom-4 sm:right-4 sm:top-4">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2"><p className="text-sm font-semibold">People</p><Badge variant="outline" className="text-[9px]">{members.length}</Badge>{realtime.state === 'connected' && <Badge variant="secondary" className="text-[9px]">{realtime.onlineCount} online</Badge>}</div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowPeople(false)} aria-label="Close people"><X className="h-4 w-4" /></Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {members.map((member) => {
                  const online = realtime.onlineIds.includes(member.id);
                  const expanded = selectedMemberId === member.id;
                  return (
                    <button key={member.id} type="button" onClick={() => setSelectedMemberId(expanded ? null : member.id)} className="w-full rounded-xl border bg-background/70 p-2.5 text-left transition hover:border-primary/30">
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/15 to-purple-500/15 text-[10px] font-semibold">
                          {initials(member.displayName)}
                          <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${online ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                        </div>
                        <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{member.displayName}</p><p className="truncate text-[10px] text-muted-foreground">{online ? 'Online now' : 'Offline'} · {member.role}</p></div>
                        {member.isOwner && <Badge variant="secondary" className="text-[8px]">Owner</Badge>}
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition ${expanded ? 'rotate-180' : ''}`} />
                      </div>
                      {expanded && (
                        <div className="mt-2 border-t pt-2 text-[10px] text-muted-foreground">
                          <div className="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1"><span>Profile</span><span className="truncate text-foreground">{member.displayName}</span><span>Email</span><span className="truncate text-foreground">{member.email || 'Not available'}</span><span>Status</span><span className={online ? 'text-emerald-600' : ''}>{online ? 'Online in this session' : 'Not currently present'}</span></div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {canInvite && (
                <div className="mt-4 space-y-2 rounded-xl border bg-background/60 p-3">
                  <div><p className="text-xs font-medium">Invite someone</p><p className="mt-0.5 text-[10px] text-muted-foreground">Existing users join immediately; new emails receive an invitation.</p></div>
                  <Input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="member@example.com" type="email" className="h-9" aria-label="Member email" />
                  <Button size="sm" className="w-full" variant="outline" onClick={() => void inviteMember()} disabled={!inviteEmail.trim() || inviting}>
                    {inviting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}Invite
                  </Button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
