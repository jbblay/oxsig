'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import ProgressBadgeRail from '@/components/app/ProgressBadgeRail';
import { LearningAnalyticsDashboard } from '@/components/learning/LearningAnalyticsDashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/use-auth';
import type { LearnerProgressSummary } from '@/lib/learning/progress-contract';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Profile = {
  id: string;
  displayName: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
  role?: string;
};

const UI_PREFERENCE_KEYS = [
  'oxsig:app-sidebar:v1',
  'oxsig:cyber-lab-layout:v1',
  'oxsig:cyber-lab-layout-hint:v1',
  'oxsig:cyber-lab-workspace-mode:v1',
];

function initials(value?: string) {
  const parts = (value || 'O').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'O';
}

export default function AccountPage() {
  const { isAuthenticated, isLoading: authLoading, profileError, refresh } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<LearnerProgressSummary | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dirty = useMemo(() => Boolean(
    profile && (displayName !== (profile.displayName || '') || bio !== (profile.bio || ''))
  ), [bio, displayName, profile]);

  const loadProgress = useCallback(async () => {
    if (!isAuthenticated) return;
    const response = await fetch('/api/users/me/progress', { cache: 'no-store' });
    if (!response.ok) return;
    const body = await response.json().catch(() => ({}));
    if (body?.progress) setProgress(body.progress as LearnerProgressSummary);
  }, [isAuthenticated]);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/users/me', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Profile service returned ${response.status}`);
      const next = (await response.json()).user as Profile;
      setProfile(next);
      setDisplayName(next.displayName || '');
      setBio(next.bio || '');
      await loadProgress();
    } catch (error) {
      setProfile(null);
      setLoadError(error instanceof Error ? error.message : 'Could not load profile');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, loadProgress]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [dirty]);

  async function save() {
    if (!profile || displayName.trim().length < 2 || !dirty) return;
    setSaving(true);
    try {
      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
        body: JSON.stringify({ displayName: displayName.trim(), bio: bio.trim() }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Update failed');
      const next = (await response.json()).user as Profile;
      setProfile(next);
      setDisplayName(next.displayName || '');
      setBio(next.bio || '');
      await refresh();
      toast.success('Saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  function resetInterface() {
    for (const key of UI_PREFERENCE_KEYS) window.localStorage.removeItem(key);
    toast.success('Interface reset.');
    window.location.assign('/home');
  }

  if (authLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader><CardTitle>Account</CardTitle><CardDescription>Sign in to continue.</CardDescription></CardHeader>
        <CardContent><Button asChild><Link href="/sign-in">Sign in</Link></Button></CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground">{profile?.email || ''}</p>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {profileError && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Profile is syncing.
        </div>
      )}

      {profile && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card/70 p-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border bg-primary/5 text-sm font-semibold text-primary">
            {profile.avatarUrl ? <UserRound className="h-5 w-5" /> : initials(profile.displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold">{profile.displayName}</span>
              <Badge variant="secondary" className="h-5 text-[10px] capitalize">{profile.role || 'member'}</Badge>
              <Badge variant="outline" className="h-5 gap-1 text-[10px]"><ShieldCheck className="h-3 w-3" />{profile.bio?.trim() ? 'Profile ready' : 'Add bio'}</Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{profile.bio?.trim() || 'Add a short technical bio so collaborators know your focus.'}</p>
          </div>
        </div>
      )}

      {progress && <ProgressBadgeRail progress={progress} />}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {loading && !profile ? (
            <Card><CardContent className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</CardContent></Card>
          ) : loadError ? (
            <Card className="border-destructive/30">
              <CardHeader><CardTitle>Profile unavailable</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{loadError}</p>
                <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Retry</Button>
              </CardContent>
            </Card>
          ) : profile ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">Profile</CardTitle>
                  {dirty && <Badge variant="outline">Unsaved</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="account-display-name" className="mb-1 block text-sm font-medium">Display name</label>
                  <Input id="account-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 100))} maxLength={100} />
                  {displayName.trim().length > 0 && displayName.trim().length < 2 && <p className="mt-1 text-xs text-destructive">Use at least 2 characters.</p>}
                </div>
                <div>
                  <label htmlFor="account-bio" className="mb-1 block text-sm font-medium">Bio</label>
                  <Textarea id="account-bio" value={bio} onChange={(event) => setBio(event.target.value.slice(0, 500))} maxLength={500} rows={4} placeholder="Optional" />
                  <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/500</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={saving || !dirty || displayName.trim().length < 2} onClick={() => void save()}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save
                  </Button>
                  {dirty && <Button variant="outline" disabled={saving} onClick={() => { setDisplayName(profile.displayName || ''); setBio(profile.bio || ''); }}>Discard</Button>}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader className="pb-3"><CardTitle className="text-base">Interface</CardTitle></CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={resetInterface}><RotateCcw className="h-4 w-4" /> Reset interface</Button>
          </CardContent>
        </Card>
      </section>

      {progress && (
        <details className="group overflow-hidden rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold sm:px-5">
            <span>Progress</span>
            <span className="text-xs font-normal text-muted-foreground group-open:hidden">View</span>
            <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Hide</span>
          </summary>
          <div className="border-t p-3 sm:p-5">
            <LearningAnalyticsDashboard progress={progress} compact />
          </div>
        </details>
      )}
    </div>
  );
}
