'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Profile = {
  displayName: string;
  email: string;
  bio: string;
  avatarUrl: string;
};

type PresenceStatus = 'available' | 'busy' | 'away' | 'focus';

const STATUS_OPTIONS: Array<{ value: PresenceStatus; label: string; dot: string }> = [
  { value: 'available', label: 'Available', dot: 'bg-emerald-500' },
  { value: 'busy', label: 'Busy', dot: 'bg-red-500' },
  { value: 'away', label: 'Away', dot: 'bg-amber-500' },
  { value: 'focus', label: 'Focus', dot: 'bg-violet-500' },
];

function initials(value?: string) {
  const parts = (value || 'O').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'O';
}

export default function CollaborationStatusControl() {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [status, setStatus] = React.useState<PresenceStatus>('available');
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/users/me', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/users/me/collaboration-status', { cache: 'no-store' }).then((response) => response.json()),
    ]).then(([profileBody, statusBody]) => {
      if (cancelled) return;
      if (profileBody.user) setProfile(profileBody.user as Profile);
      if (STATUS_OPTIONS.some((option) => option.value === statusBody.status)) setStatus(statusBody.status as PresenceStatus);
      setMessage(typeof statusBody.message === 'string' ? statusBody.message : '');
    }).catch(() => undefined).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const selected = STATUS_OPTIONS.find((option) => option.value === status) || STATUS_OPTIONS[0];

  const saveStatus = async (nextStatus = status) => {
    if (saving) return;
    setSaving(true);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/users/me/collaboration-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ status: nextStatus, message: message.trim() || null }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not update status');
      setStatus(body.status as PresenceStatus);
      setMessage(body.message || '');
      toast.success('Collaboration status updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update status');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) return null;

  return (
    <div className="absolute bottom-[6.6rem] left-2.5 z-30 sm:bottom-[6.1rem] sm:left-3">
      {open && (
        <div className="mb-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border bg-card p-3 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" referrerPolicy="no-referrer" /> : initials(profile.displayName)}
              <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${selected.dot}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{profile.displayName}</p>
              <p className="truncate text-[10px] text-muted-foreground">{profile.email}</p>
              {profile.bio && <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{profile.bio}</p>}
            </div>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close profile status"><X className="h-3.5 w-3.5" /></Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => { setStatus(option.value); void saveStatus(option.value); }}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition hover:bg-muted/50 ${status === option.value ? 'border-primary/45 bg-primary/5' : ''}`}
              >
                <span className={`h-2 w-2 rounded-full ${option.dot}`} />
                <span className="flex-1">{option.label}</span>
                {status === option.value && <Check className="h-3 w-3 text-primary" />}
              </button>
            ))}
          </div>

          <div className="mt-2 flex gap-1.5">
            <Input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={80} placeholder="Status message…" className="h-8 text-xs" />
            <Button type="button" size="sm" className="h-8 shrink-0" onClick={() => void saveStatus()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
          </div>

          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{selected.label}{message ? ` · ${message}` : ''}</span>
            <Link href="/account" className="font-medium text-primary hover:underline">Edit profile</Link>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-md transition hover:scale-105"
        aria-label={`Your profile status: ${selected.label}`}
        title={`Your profile · ${selected.label}`}
      >
        {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-[10px] font-semibold">{initials(profile.displayName)}</span>}
        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${selected.dot}`} />
      </button>
    </div>
  );
}
