'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BookOpen,
  Box,
  CheckCheck,
  FileText,
  Loader2,
  Mic,
  Pencil,
  Reply,
  RotateCcw,
  SmilePlus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export type ReactionSummary = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export type ReplySummary = {
  id: string;
  text: string;
  senderName: string;
  deleted: boolean;
};

export type CollaborationMessageView = {
  id: string;
  collaborationId: string;
  text: string;
  type: 'text' | 'explain' | 'resource' | 'audio' | 'practice';
  metadata: Record<string, unknown>;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  deleted?: boolean;
  senderId: string;
  senderName: string;
  senderEmail?: string | null;
  senderAvatar?: string | null;
  isOwnMessage: boolean;
  replyTo?: ReplySummary | null;
  reactions?: ReactionSummary[];
  deliveryState?: 'sending' | 'failed';
  clientMessageId?: string;
};

type Attachment = {
  key: string;
  filename: string;
  size: number;
  mimeType: string;
};

type SharedBoard = {
  id: string;
  title: string;
  href: string;
  permission: 'viewer';
};

const REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅'] as const;

function initials(value?: string | null) {
  const text = value?.trim() || 'O';
  const parts = text.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'O';
}

function formatTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(value?: number) {
  if (!value || value < 1) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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

type Props = {
  message: CollaborationMessageView;
  activeId: string;
  onlineIds: string[];
  onReply: (message: CollaborationMessageView) => void;
  onEdit: (message: CollaborationMessageView, text: string) => Promise<void>;
  onDelete: (message: CollaborationMessageView) => Promise<void>;
  onReaction: (message: CollaborationMessageView, emoji: string) => Promise<void>;
  onRetry?: (message: CollaborationMessageView) => Promise<void>;
};

export default function CollaborationMessageItem({
  message,
  activeId,
  onlineIds,
  onReply,
  onEdit,
  onDelete,
  onReaction,
  onRetry,
}: Props) {
  const [editing, setEditing] = React.useState(false);
  const [editText, setEditText] = React.useState(message.text);
  const [showReactions, setShowReactions] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!editing) setEditText(message.text);
  }, [editing, message.text]);

  const attachment = attachmentFrom(message.metadata);
  const sharedBoard = boardFrom(message.metadata);
  const attachmentUrl = attachment
    ? `/api/collaborations/${activeId}/attachments?key=${encodeURIComponent(attachment.key)}`
    : null;
  const practiceHref = typeof message.metadata.href === 'string' ? message.metadata.href : '/labs';
  const persisted = !message.deliveryState;
  const canEdit = persisted && message.isOwnMessage && !message.deleted && ['text', 'explain'].includes(message.type);
  const canDelete = persisted && message.isOwnMessage && !message.deleted;

  const saveEdit = async () => {
    const next = editText.trim();
    if (!next || next === message.text || busy) {
      if (next === message.text) setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onEdit(message, next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const deleteMessage = async () => {
    if (busy || !window.confirm('Delete this message? Replies will keep a “Message deleted” reference.')) return;
    setBusy(true);
    try {
      await onDelete(message);
    } finally {
      setBusy(false);
    }
  };

  const toggleReaction = async (emoji: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await onReaction(message, emoji);
      setShowReactions(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`group flex gap-2 ${message.isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      {!message.isOwnMessage && (
        <div className="relative mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
          {initials(message.senderName)}
          {onlineIds.includes(message.senderId) && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
          )}
        </div>
      )}

      <div className={`flex max-w-[94%] flex-col sm:max-w-[76%] ${message.isOwnMessage ? 'items-end' : 'items-start'}`}>
        <div className="mb-1 flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
          {!message.isOwnMessage && <span className="font-medium text-foreground">{message.senderName}</span>}
          {message.type === 'explain' && <span className="flex items-center gap-1 text-primary"><Sparkles className="h-3 w-3" />Explain</span>}
          <span>{formatTime(message.createdAt)}</span>
          {message.editedAt && !message.deleted && <span>Edited</span>}
        </div>

        <div className={`w-fit max-w-full rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${message.isOwnMessage ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border bg-card'}`}>
          {message.replyTo && (
            <div className={`mb-2 max-w-sm rounded-lg border-l-2 px-2.5 py-1.5 text-[11px] ${message.isOwnMessage ? 'border-primary-foreground/40 bg-primary-foreground/10' : 'border-primary/50 bg-muted/50'}`}>
              <p className="font-semibold opacity-80">{message.replyTo.senderName}</p>
              <p className="line-clamp-2 opacity-75">{message.replyTo.deleted ? 'Message deleted' : message.replyTo.text}</p>
            </div>
          )}

          {editing ? (
            <div className="min-w-[min(22rem,72vw)] space-y-2 text-foreground">
              <Textarea value={editText} onChange={(event) => setEditText(event.target.value)} maxLength={5000} className="min-h-20 bg-background" autoFocus />
              <div className="flex justify-end gap-1.5">
                <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)} disabled={busy}><X className="mr-1 h-3 w-3" />Cancel</Button>
                <Button type="button" size="sm" className="h-7" onClick={() => void saveEdit()} disabled={busy || !editText.trim()}>{busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Save</Button>
              </div>
            </div>
          ) : message.deleted ? (
            <p className="italic opacity-70">Message deleted</p>
          ) : sharedBoard ? (
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

        {Boolean(message.reactions?.length) && (
          <div className={`mt-1 flex flex-wrap gap-1 ${message.isOwnMessage ? 'justify-end' : 'justify-start'}`}>
            {message.reactions?.map((reaction) => (
              <button
                type="button"
                key={reaction.emoji}
                onClick={() => void toggleReaction(reaction.emoji)}
                disabled={busy || !persisted || Boolean(message.deleted)}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition hover:bg-muted ${reaction.reactedByMe ? 'border-primary/50 bg-primary/10' : 'bg-background'}`}
                aria-label={`${reaction.emoji} ${reaction.count}`}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
          </div>
        )}

        {message.isOwnMessage && (
          <div className="mt-1 flex min-h-5 items-center gap-1 px-1 text-[10px] text-muted-foreground">
            {message.deliveryState === 'sending' ? (
              <><Loader2 className="h-3 w-3 animate-spin" />Sending</>
            ) : message.deliveryState === 'failed' ? (
              <button type="button" onClick={() => onRetry && void onRetry(message)} disabled={!onRetry} className="flex items-center gap-1 text-destructive hover:underline">
                <AlertCircle className="h-3 w-3" />Failed <RotateCcw className="ml-1 h-3 w-3" />Retry
              </button>
            ) : (
              <><CheckCheck className="h-3 w-3" />Delivered</>
            )}
          </div>
        )}

        {persisted && !message.deleted && !editing && (
          <div className={`relative mt-0.5 flex items-center gap-0.5 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ${message.isOwnMessage ? 'justify-end' : 'justify-start'}`}>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => onReply(message)}><Reply className="mr-1 h-3 w-3" />Reply</Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowReactions((value) => !value)} aria-label="React"><SmilePlus className="h-3.5 w-3.5" /></Button>
            {canEdit && <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)} aria-label="Edit message"><Pencil className="h-3.5 w-3.5" /></Button>}
            {canDelete && <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => void deleteMessage()} aria-label="Delete message"><Trash2 className="h-3.5 w-3.5" /></Button>}
            {showReactions && (
              <div className={`absolute bottom-8 z-10 flex gap-0.5 rounded-full border bg-popover p-1 shadow-lg ${message.isOwnMessage ? 'right-0' : 'left-0'}`}>
                {REACTIONS.map((emoji) => (
                  <button key={emoji} type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-muted" onClick={() => void toggleReaction(emoji)} disabled={busy} aria-label={`React ${emoji}`}>{emoji}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
