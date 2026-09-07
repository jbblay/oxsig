'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { LearningAnalyticsDashboard } from '@/components/learning/LearningAnalyticsDashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/use-auth';
import type { LearnerProgressSummary } from '@/lib/learning/progress-contract';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Profile = { id: string; displayName: string; email?: string; bio?: string; avatarUrl?: string; role?: string };

const UI_PREFERENCE_KEYS = [
  'oxsig:app-sidebar:v1',
  'oxsig:cyber-lab-layout:v1',
  'oxsig:cyber-lab-layout-hint:v1',
  'oxsig:cyber-lab-workspace-mode:v1',
];

const ACADEMY_LOCAL_KEYS = [
  'oxsig:academy-course:v1',
  'oxsig:academy-progress:v1',
  'oxsig:academy-server-state:v1',
];

export default function AccountPage() {
  const { isAuthenticated, isLoading: authLoading, profileError, refresh } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<LearnerProgressSummary | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingAcademy, setDeletingAcademy] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
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

  useEffect(() => { void load(); }, [load]);

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
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  function resetInterface() {
    for (const key of UI_PREFERENCE_KEYS) window.localStorage.removeItem(key);
    toast.success('Interface preferences reset');
    window.location.assign('/home');
  }

  async function deleteAcademyHistory() {
    setDeletingAcademy(true);
    try {
      const response = await fetch('/api/academy/reset', {
        method: 'DELETE',
        headers: { 'x-csrf-token': await getCsrfToken() },
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Academy reset failed');
      for (const key of ACADEMY_LOCAL_KEYS) window.localStorage.removeItem(key);
      setResetDialogOpen(false);
      await loadProgress();
      toast.success('AI Academy is back to a clean slate');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Academy reset failed');
    } finally {
      setDeletingAcademy(false);
    }
  }

  if (authLoading) return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (!isAuthenticated) return <Card className="mx-auto max-w-md"><CardHeader><CardTitle>My progress</CardTitle><CardDescription>Sign in to view your learning analytics, rewards and account.</CardDescription></CardHeader><CardContent><Button asChild><Link href="/sign-in">Sign in</Link></Button></CardContent></Card>;

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><User className="h-7 w-7" /><h1 className="text-3xl font-semibold">My progress</h1></div>
          <p className="mt-1 text-muted-foreground">Real learning activity, unlocks and account controls. Nothing here is demo data.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
      </div>

      {profileError && <Card><CardContent className="pt-6 text-sm text-amber-600">Some profile information is still synchronizing. Your signed-in session remains active.</CardContent></Card>}

      {progress ? (
        <LearningAnalyticsDashboard progress={progress} />
      ) : !loadError ? (
        <section className="space-y-4" aria-label="Loading learner progress">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><div className="h-48 animate-pulse rounded-2xl border bg-muted/40" /><div className="h-48 animate-pulse rounded-2xl border bg-muted/30" /></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl border bg-muted/30" />)}</div>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          {loading ? (
            <Card><CardContent className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading profile…</CardContent></Card>
          ) : loadError ? (
            <Card className="border-destructive/30">
              <CardHeader><CardTitle>Profile unavailable</CardTitle><CardDescription>Your account is signed in, but the profile could not be loaded.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{loadError}</p>
                <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Try again</Button>
              </CardContent>
            </Card>
          ) : profile ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><CardTitle>Your profile</CardTitle><CardDescription>{profile.email || 'Signed-in account'}</CardDescription></div>
                  {dirty && <Badge variant="outline">Unsaved changes</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="account-display-name" className="mb-1 block text-sm font-medium">Display name</label>
                  <Input id="account-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 100))} maxLength={100} />
                  {displayName.trim().length > 0 && displayName.trim().length < 2 && <p className="mt-1 text-xs text-destructive">Use at least 2 characters.</p>}
                </div>
                <div>
                  <label htmlFor="account-bio" className="mb-1 block text-sm font-medium">About you</label>
                  <Textarea id="account-bio" value={bio} onChange={(event) => setBio(event.target.value.slice(0, 500))} maxLength={500} rows={5} placeholder="What are you learning or building?" />
                  <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/500</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={saving || !dirty || displayName.trim().length < 2} onClick={() => void save()}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save changes
                  </Button>
                  {dirty && <Button variant="outline" disabled={saving} onClick={() => { setDisplayName(profile.displayName || ''); setBio(profile.bio || ''); }}>Discard</Button>}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {progress?.academy.activeCourse && (
            <Card className="overflow-hidden border-sky-500/20 bg-gradient-to-br from-sky-500/5 to-background">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div><CardDescription>Current course</CardDescription><CardTitle className="mt-1">{progress.academy.activeCourse.title}</CardTitle></div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400"><GraduationCap className="h-5 w-5" /></span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-xs"><span>{progress.academy.activeCourse.completedLessons}/{progress.academy.activeCourse.totalLessons} lessons</span><span>{progress.academy.activeCourse.score}% mastery</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(0, Math.min(100, progress.academy.activeCourse.totalLessons > 0 ? (progress.academy.activeCourse.completedLessons / progress.academy.activeCourse.totalLessons) * 100 : 0))}%` }} /></div>
                <Button asChild className="w-full"><Link href="/academy">Continue course</Link></Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>How rewards work</CardTitle><CardDescription>OXSIG rewards are deterministic, not manually filled dashboard numbers.</CardDescription></CardHeader>
            <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
              <p>XP increases from completed lessons, mastered courses, passed practical checkpoints, started labs and recorded active days.</p>
              <p>Lab runtime is shown as analytics but gives no XP, so leaving a machine running cannot improve your level.</p>
              <p>Streak badges use your longest recorded streak, so an earned streak milestone does not disappear just because your current streak later resets.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader><CardTitle>Start fresh</CardTitle><CardDescription>Recover from a confusing layout or deliberately clear your Academy learning history.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold">Reset interface</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Restore navigation and Cyber Lab layout preferences to defaults. Courses, labs and saved work remain.</p></div>
            <Button variant="outline" className="shrink-0" onClick={resetInterface}><RotateCcw className="h-4 w-4" /> Reset layout</Button>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-destructive/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold">Clear AI Academy</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Delete your Academy courses, progress, questions, practice attempts and Academy-derived reward progress. Cyber Lab resources stay untouched.</p></div>
            <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
              <DialogTrigger asChild><Button variant="outline" className="shrink-0 border-destructive/30 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /> Clear Academy</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete all Academy learning history?</DialogTitle>
                  <DialogDescription>This cannot be undone. Generated courses, lesson progress, instructor questions and Academy practice history will be permanently deleted. Running Cyber Lab machines and other OXSIG workspaces stay untouched.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setResetDialogOpen(false)} disabled={deletingAcademy}>Cancel</Button>
                  <Button variant="destructive" onClick={() => void deleteAcademyHistory()} disabled={deletingAcademy}>{deletingAcademy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete Academy history</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
