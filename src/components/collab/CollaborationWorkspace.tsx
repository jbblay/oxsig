"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpen,
  Box,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircle,
  Mic,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Square,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth/use-auth";

type CollaborationMember = {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  role: string;
};

type CollaborationSession = {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  currentRole: string;
  createdAt: string;
  updatedAt: string;
  members: CollaborationMember[];
  lastMessage: string;
  lastMessageType?: CollaborationMessageType | null;
  lastMessageAt?: string | null;
};

type CollaborationMessageType = "text" | "explain" | "resource" | "audio" | "practice" | "system";

type CollaborationMessage = {
  id: string;
  collaborationId: string;
  senderId: string;
  senderName: string;
  senderEmail?: string | null;
  senderAvatarUrl?: string | null;
  messageType: CollaborationMessageType;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  mine: boolean;
};

type UploadGrant = {
  upload: { url: string; fields: Record<string, string>; expiresIn: number };
  object: {
    id: string;
    key: string;
    filename: string;
    size: number;
    mimeType: string;
    url: string;
  };
};

async function csrfToken() {
  const response = await fetch("/api/csrf-token", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not prepare a secure request");
  return (await response.json()).token as string;
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "O";
}

function fileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sessionPreview(session: CollaborationSession) {
  if (!session.lastMessageType) return "No messages yet";
  if (session.lastMessageType === "resource") return "Resource attached";
  if (session.lastMessageType === "audio") return "Voice note";
  if (session.lastMessageType === "practice") return "Practice activity";
  if (session.lastMessageType === "explain") return session.lastMessage || "Explanation";
  return session.lastMessage || "New message";
}

function preferredAudioMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
}

export default function CollaborationWorkspace() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [sessions, setSessions] = React.useState<CollaborationSession[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<CollaborationMessage[]>([]);
  const [loadingSessions, setLoadingSessions] = React.useState(true);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [composer, setComposer] = React.useState("");
  const [composerMode, setComposerMode] = React.useState<"text" | "explain">("text");
  const [newSessionOpen, setNewSessionOpen] = React.useState(false);
  const [newSessionName, setNewSessionName] = React.useState("");
  const [newSessionDescription, setNewSessionDescription] = React.useState("");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviting, setInviting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [recordingSeconds, setRecordingSeconds] = React.useState(0);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = React.useRef(0);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recordingStreamRef = React.useRef<MediaStream | null>(null);
  const recordingChunksRef = React.useRef<Blob[]>([]);

  const activeSession = sessions.find((session) => session.id === activeId) || null;

  const loadSessions = React.useCallback(async (silent = false) => {
    if (!isAuthenticated) {
      setSessions([]);
      setActiveId(null);
      setLoadingSessions(false);
      return;
    }

    if (!silent) setLoadingSessions(true);
    try {
      const response = await fetch("/api/collaborations", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Could not load collaboration sessions"));
      const body = await response.json();
      const next = (body.sessions || []) as CollaborationSession[];
      setSessions(next);
      setActiveId((current) => {
        if (current && next.some((session) => session.id === current)) return current;
        return next[0]?.id || null;
      });
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load collaboration sessions");
    } finally {
      if (!silent) setLoadingSessions(false);
    }
  }, [isAuthenticated]);

  const loadMessages = React.useCallback(async (silent = false) => {
    if (!activeId) {
      setMessages([]);
      return;
    }

    if (!silent) setLoadingMessages(true);
    try {
      const response = await fetch(`/api/collaborations/${activeId}/messages`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Could not load this conversation"));
      const body = await response.json();
      setMessages((body.messages || []) as CollaborationMessage[]);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load this conversation");
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, [activeId]);

  React.useEffect(() => {
    if (authLoading) return;
    void loadSessions();
  }, [authLoading, loadSessions]);

  React.useEffect(() => {
    previousMessageCountRef.current = 0;
    void loadMessages();
    if (!activeId) return;
    const timer = window.setInterval(() => void loadMessages(true), 3000);
    return () => window.clearInterval(timer);
  }, [activeId, loadMessages]);

  React.useEffect(() => {
    if (messages.length !== previousMessageCountRef.current) {
      previousMessageCountRef.current = messages.length;
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    }
  }, [messages.length]);

  React.useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  React.useEffect(() => () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function createSession() {
    const name = newSessionName.trim();
    if (!name) return;
    setSending(true);
    try {
      const response = await fetch("/api/collaborations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": await csrfToken() },
        body: JSON.stringify({ name, description: newSessionDescription.trim() }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not create session"));
      const body = await response.json();
      const session = body.session as CollaborationSession;
      setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
      setActiveId(session.id);
      setNewSessionName("");
      setNewSessionDescription("");
      setNewSessionOpen(false);
      toast.success("Collaboration session created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create session");
    } finally {
      setSending(false);
    }
  }

  async function sendMessage(
    messageType: Exclude<CollaborationMessageType, "system">,
    body: string,
    metadata: Record<string, unknown> = {}
  ) {
    if (!activeId) return;
    if ((messageType === "text" || messageType === "explain") && !body.trim()) return;

    setSending(true);
    try {
      const response = await fetch(`/api/collaborations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": await csrfToken() },
        body: JSON.stringify({ messageType, body: body.trim(), metadata }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not send message"));
      const result = await response.json();
      const sent = result.message as CollaborationMessage;
      setMessages((current) => current.some((message) => message.id === sent.id) ? current : [...current, sent]);
      setComposer("");
      setComposerMode("text");
      void loadSessions(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send message");
    } finally {
      setSending(false);
    }
  }

  async function submitComposer() {
    const body = composer.trim();
    if (!body) return;
    await sendMessage(composerMode, body);
  }

  async function uploadFile(file: File) {
    const grantResponse = await fetch("/api/storage/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": await csrfToken() },
      body: JSON.stringify({
        filename: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      }),
    });
    if (!grantResponse.ok) throw new Error(await responseError(grantResponse, "Upload could not be prepared"));

    const grant = await grantResponse.json() as UploadGrant;
    const form = new FormData();
    Object.entries(grant.upload.fields).forEach(([key, value]) => form.append(key, value));
    form.append("file", file);
    const uploaded = await fetch(grant.upload.url, { method: "POST", body: form });
    if (!uploaded.ok) throw new Error(`File upload failed (${uploaded.status})`);
    return grant.object;
  }

  async function attachFile(file?: File) {
    if (!file || !activeId) return;
    setUploading(true);
    try {
      const object = await uploadFile(file);
      await sendMessage("resource", composer.trim() || object.filename, {
        key: object.key,
        filename: object.filename,
        size: object.size,
        mimeType: object.mimeType,
        url: object.url,
      });
      toast.success("Resource attached to the conversation");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not attach resource");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function startRecording() {
    if (!activeId) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice recording is not supported by this browser");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      setRecordingSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        toast.error("Voice recording failed");
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        setRecording(false);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const chunks = [...recordingChunksRef.current];
        recordingChunksRef.current = [];
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        setRecording(false);

        if (chunks.length === 0) return;
        void (async () => {
          setUploading(true);
          try {
            const extension = type.includes("mp4") ? "m4a" : "webm";
            const file = new File([new Blob(chunks, { type })], `voice-note-${Date.now()}.${extension}`, { type });
            const object = await uploadFile(file);
            await sendMessage("audio", "Voice note", {
              key: object.key,
              filename: object.filename,
              size: object.size,
              mimeType: object.mimeType,
              url: object.url,
              durationSeconds: recordingSeconds,
            });
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not send voice note");
          } finally {
            setUploading(false);
          }
        })();
      };

      recorder.start(500);
      setRecording(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Microphone access was not available");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  async function inviteMember() {
    if (!activeId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const response = await fetch(`/api/collaborations/${activeId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": await csrfToken() },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not add that person"));
      setInviteEmail("");
      await loadSessions(true);
      toast.success("Person added to the session");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that person");
    } finally {
      setInviting(false);
    }
  }

  function practiceTogether() {
    const prompt = composer.trim() || "Open the Cyber Lab and practice this together.";
    void sendMessage("practice", prompt, { href: "/labs", label: "Open Cyber Lab" });
  }

  if (authLoading || loadingSessions) {
    return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <Users className="mx-auto h-9 w-9 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-semibold">Collaboration</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to open persistent collaboration conversations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 p-2 text-white shadow-sm">
              <MessageCircle className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold md:text-3xl">Collaboration</h1>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            One conversation for discussion, explanations, resources, voice notes and hands-on practice.
          </p>
        </div>
        <Badge variant="outline" className="w-fit"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Conversation-first workspace</Badge>
      </div>

      <div className="grid min-h-[680px] gap-3 lg:grid-cols-[250px_minmax(0,1fr)_240px]">
        <aside className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b p-3">
            <div>
              <p className="text-sm font-semibold">Sessions</p>
              <p className="text-[11px] text-muted-foreground">Your shared conversations</p>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setNewSessionOpen((open) => !open)} aria-label="Create collaboration session">
              {newSessionOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>

          {newSessionOpen && (
            <div className="space-y-2 border-b bg-muted/20 p-3">
              <Input value={newSessionName} onChange={(event) => setNewSessionName(event.target.value)} placeholder="Session name" maxLength={120} />
              <Input value={newSessionDescription} onChange={(event) => setNewSessionDescription(event.target.value)} placeholder="What are you working on?" maxLength={500} />
              <Button size="sm" className="w-full" disabled={sending || !newSessionName.trim()} onClick={() => void createSession()}>
                {sending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}Create session
              </Button>
            </div>
          )}

          <div className="max-h-[610px] space-y-1 overflow-auto p-2">
            {sessions.length === 0 ? (
              <button type="button" onClick={() => setNewSessionOpen(true)} className="w-full rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground hover:border-primary/30 hover:text-foreground">
                <MessageCircle className="mx-auto mb-2 h-6 w-6 opacity-50" />
                Create your first conversation
              </button>
            ) : sessions.map((session) => {
              const active = session.id === activeId;
              return (
                <button
                  type="button"
                  key={session.id}
                  onClick={() => setActiveId(session.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left transition-all duration-200 ${active ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${active ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white" : "bg-muted"}`}>
                      {initials(session.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{session.name}</p>
                        <span className="text-[9px] text-muted-foreground">{session.members.length}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{sessionPreview(session)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-[680px] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card">
          {!activeSession ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="rounded-2xl bg-muted p-4"><MessageCircle className="h-8 w-8 text-muted-foreground" /></div>
              <p className="mt-4 font-semibold">Choose or create a collaboration session</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">The conversation becomes the shared timeline instead of sending people to separate Explain, Resources and Practice pages.</p>
              <Button className="mt-4" size="sm" onClick={() => setNewSessionOpen(true)}><Plus className="mr-2 h-4 w-4" />New session</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{activeSession.name}</p>
                    <Badge variant="secondary" className="text-[9px]">{activeSession.members.length} {activeSession.members.length === 1 ? "member" : "members"}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{activeSession.description || "Shared conversation"}</p>
                </div>
              </div>

              <div className="flex-1 overflow-auto bg-muted/10 px-3 py-4 sm:px-5">
                {loadingMessages ? (
                  <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>
                ) : messages.length === 0 ? (
                  <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                    <div className="rounded-2xl border bg-background p-4 shadow-sm"><Sparkles className="h-7 w-7 text-primary" /></div>
                    <p className="mt-4 text-sm font-semibold">Start the conversation</p>
                    <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Type a message, switch to Explain, attach a resource, record a voice note or drop a practice activity directly into this timeline.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((message) => {
                      const metadata = message.metadata || {};
                      const resourceUrl = typeof metadata.url === "string" ? metadata.url : "";
                      const filename = typeof metadata.filename === "string" ? metadata.filename : "Resource";
                      const resourceSize = typeof metadata.size === "number" ? metadata.size : 0;
                      const practiceHref = typeof metadata.href === "string" ? metadata.href : "/labs";

                      return (
                        <div key={message.id} className={`flex gap-2 ${message.mine ? "justify-end" : "justify-start"}`}>
                          {!message.mine && (
                            <div className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                              {initials(message.senderName)}
                            </div>
                          )}
                          <div className={`max-w-[88%] sm:max-w-[76%] ${message.mine ? "items-end" : "items-start"}`}>
                            <div className={`mb-1 flex items-center gap-2 text-[10px] text-muted-foreground ${message.mine ? "justify-end" : "justify-start"}`}>
                              <span className="font-medium text-foreground">{message.mine ? "You" : message.senderName}</span>
                              <span>{messageTime(message.createdAt)}</span>
                            </div>

                            {message.messageType === "resource" ? (
                              <div className="rounded-2xl border bg-background p-3 shadow-sm">
                                <div className="flex items-center gap-3">
                                  <div className="rounded-xl bg-muted p-2"><FileText className="h-5 w-5" /></div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{filename}</p>
                                    <p className="text-[10px] text-muted-foreground">{fileSize(resourceSize)}{message.body && message.body !== filename ? ` · ${message.body}` : ""}</p>
                                  </div>
                                  {resourceUrl && <Button asChild size="icon" variant="ghost" className="h-8 w-8"><a href={resourceUrl} aria-label={`Open ${filename}`}><ExternalLink className="h-4 w-4" /></a></Button>}
                                </div>
                              </div>
                            ) : message.messageType === "audio" ? (
                              <div className="min-w-[240px] rounded-2xl border bg-background p-3 shadow-sm">
                                <div className="mb-2 flex items-center gap-2 text-xs font-medium"><Mic className="h-4 w-4" />Voice note</div>
                                {resourceUrl ? <audio controls preload="metadata" className="h-9 w-full max-w-[320px]" src={resourceUrl}>Your browser does not support audio playback.</audio> : <p className="text-xs text-muted-foreground">Audio is unavailable.</p>}
                              </div>
                            ) : message.messageType === "practice" ? (
                              <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-blue-500/5 via-background to-purple-500/5 p-3 shadow-sm">
                                <div className="flex items-start gap-3">
                                  <div className="rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 p-2 text-white"><Box className="h-4 w-4" /></div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold">Practice together</p>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{message.body}</p>
                                    <Button asChild size="sm" variant="outline" className="mt-2 h-8"><Link href={practiceHref}>Open Cyber Lab<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Link></Button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-sm ${message.mine ? "bg-primary text-primary-foreground" : "border bg-background"}`}>
                                {message.messageType === "explain" && (
                                  <div className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${message.mine ? "text-primary-foreground/75" : "text-primary"}`}>
                                    <BookOpen className="h-3.5 w-3.5" />Explanation
                                  </div>
                                )}
                                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="border-t bg-background p-3">
                {recording && (
                  <div className="mb-2 flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs">
                    <span className="flex items-center gap-2 font-medium text-destructive"><span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />Recording voice note · {recordingSeconds}s</span>
                    <Button size="sm" variant="ghost" className="h-7" onClick={stopRecording}><Square className="mr-1.5 h-3 w-3 fill-current" />Stop</Button>
                  </div>
                )}

                {composerMode === "explain" && (
                  <div className="mb-2 flex items-center justify-between rounded-lg bg-primary/5 px-2.5 py-1.5 text-[10px] text-primary">
                    <span className="flex items-center gap-1.5 font-semibold"><BookOpen className="h-3.5 w-3.5" />Explain mode — your next message is shown as an explanation.</span>
                    <button type="button" onClick={() => setComposerMode("text")} className="rounded p-1 hover:bg-primary/10" aria-label="Exit explain mode"><X className="h-3 w-3" /></button>
                  </div>
                )}

                <div className="flex items-end gap-2 rounded-2xl border bg-muted/10 p-2 focus-within:border-primary/40">
                  <Textarea
                    ref={composerRef}
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submitComposer();
                      }
                    }}
                    placeholder={composerMode === "explain" ? "Write an explanation…" : "Message the session…"}
                    className="min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
                    maxLength={4000}
                  />
                  <Button size="icon" className="h-10 w-10 shrink-0 rounded-xl" disabled={sending || !composer.trim()} onClick={() => void submitComposer()} aria-label="Send message">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => void attachFile(event.target.files?.[0])} />
                  <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={uploading || !activeId} onClick={() => fileInputRef.current?.click()}>
                    {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1.5 h-3.5 w-3.5" />}Attach
                  </Button>
                  <Button size="sm" variant={composerMode === "explain" ? "secondary" : "ghost"} className="h-8 text-xs" onClick={() => { setComposerMode((mode) => mode === "explain" ? "text" : "explain"); requestAnimationFrame(() => composerRef.current?.focus()); }}>
                    <BookOpen className="mr-1.5 h-3.5 w-3.5" />Explain
                  </Button>
                  <Button size="sm" variant={recording ? "destructive" : "ghost"} className="h-8 text-xs" disabled={uploading} onClick={() => recording ? stopRecording() : void startRecording()}>
                    {recording ? <Square className="mr-1.5 h-3.5 w-3.5 fill-current" /> : <Mic className="mr-1.5 h-3.5 w-3.5" />}{recording ? "Stop" : "Record"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={sending} onClick={practiceTogether}>
                    <Box className="mr-1.5 h-3.5 w-3.5" />Practice
                  </Button>
                  <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">Enter to send · Shift+Enter for a new line</span>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b p-3">
            <p className="text-sm font-semibold">People & tools</p>
            <p className="text-[11px] text-muted-foreground">Everything stays connected to the session</p>
          </div>

          {!activeSession ? (
            <div className="p-5 text-center text-xs text-muted-foreground">Select a session to see its people and tools.</div>
          ) : (
            <div className="space-y-5 p-3">
              <div>
                <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Participants</p><Badge variant="outline" className="text-[9px]">{activeSession.members.length}</Badge></div>
                <div className="space-y-2">
                  {activeSession.members.map((member) => (
                    <div key={member.id} className="flex items-center gap-2 rounded-xl p-2 hover:bg-muted/40">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">{initials(member.name)}</div>
                      <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{member.name}</p><p className="truncate text-[9px] capitalize text-muted-foreground">{member.role}</p></div>
                    </div>
                  ))}
                </div>
              </div>

              {['owner', 'admin'].includes(activeSession.currentRole) && (
                <div className="space-y-2 rounded-xl border p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><UserPlus className="h-3.5 w-3.5" />Add participant</p>
                  <Input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="user@example.com" type="email" className="h-9 text-xs" />
                  <Button size="sm" variant="outline" className="h-8 w-full text-xs" disabled={inviting || !inviteEmail.trim()} onClick={() => void inviteMember()}>
                    {inviting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}Add to session
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Inside the conversation</p>
                <div className="space-y-1.5 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2"><MessageCircle className="h-3.5 w-3.5 text-foreground" /><span>Normal discussion</span></div>
                  <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2"><BookOpen className="h-3.5 w-3.5 text-foreground" /><span>Structured explanations</span></div>
                  <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2"><Paperclip className="h-3.5 w-3.5 text-foreground" /><span>Shared resources</span></div>
                  <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2"><Mic className="h-3.5 w-3.5 text-foreground" /><span>Voice notes</span></div>
                  <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2"><Box className="h-3.5 w-3.5 text-foreground" /><span>Practice cards</span></div>
                </div>
              </div>

              <div className="rounded-xl border border-primary/15 bg-gradient-to-br from-blue-500/5 via-background to-purple-500/5 p-3 text-[11px] leading-5 text-muted-foreground">
                The storyboard remains available for deeper recorded explanations, but it now sits behind the conversation instead of being the Collaboration landing experience.
                <Button asChild size="sm" variant="ghost" className="mt-2 h-8 w-full text-xs"><Link href="/collab/storyboards"><BookOpen className="mr-1.5 h-3.5 w-3.5" />Open storyboard studio</Link></Button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
