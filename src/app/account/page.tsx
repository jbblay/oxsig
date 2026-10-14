'use client';

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import {
  Award,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  Crown,
  Database,
  FlaskConical,
  Gauge,
  Globe,
  KeyRound,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  UserRound,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import AccountDataPanel from '@/components/account/AccountDataPanel';
import ProfileEditor, { draftFromProfile, draftsEqual, type ProfileDraft } from '@/components/account/ProfileEditor';
import ProgressBadgeRail from '@/components/app/ProgressBadgeRail';
import VillainBadgeGrid from '@/components/profile/VillainBadgeGrid';
import { LearningAnalyticsDashboard } from '@/components/learning/LearningAnalyticsDashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  EXPERIENCE_LEVELS,
  FOCUS_AREAS,
  profileCompleteness,
  type AccountProfile,
} from '@/lib/account/profile-contract';
import { useAuth } from '@/lib/auth/use-auth';
import type { LearnerProgressSummary } from '@/lib/learning/progress-contract';
import { getCsrfToken } from '@/lib/security/csrf-client';
import { cn } from '@/lib/utils';

type Section = 'profile' | 'progress' | 'security' | 'data';

const SECTIONS: Array<{ id: Section; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'progress', label: 'Progress', icon: Gauge },
  { id: 'security', label: 'Security', icon: KeyRound },
  { id: 'data', label: 'Data & privacy', icon: Database },
];

function initials(value?: string) {
  const parts = (value || 'O').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'O';
}

/** Accept older or partial payloads without breaking the page. */
function normalize(raw: Partial<AccountProfile> & { id: string }): AccountProfile {
  return {
    publicKey: '',
    displayName: '',
    bio: '',
    avatarUrl: '',
    headline: '',
    location: '',
    websiteUrl: '',
    experienceLevel: null,
    focusAreas: [],
    role: 'user',
    isFounder: false,
    isActive: true,
    emailVerified: false,
    onboardedAt: null,
    createdAt: null,
    updatedAt: null,
    lastSeenAt: null,
    ...raw,
  } as AccountProfile;
}

function memberSince(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en', { month: 'long', year: 'numeric' });
}

function CompletenessRing({ percent }: { percent: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90" aria-hidden="true">
      <circle cx="22" cy="22" r={radius} className="fill-none stroke-muted" strokeWidth="4" />
      <circle
        cx="22"
        cy="22"
        r={radius}
        className="fill-none stroke-primary transition-[stroke-dashoffset] duration-500"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent / 100)}
      />
    </svg>
  );
}

export default function AccountPage() {
  const { isAuthenticated, isLoading: authLoading, profileError, refresh, logout } = useAuth();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [progress, setProgress] = useState<LearnerProgressSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testResetEnabled, setTestResetEnabled] = useState(false);
  const [section, setSection] = useState<Section>('profile');

  const baseline = useMemo(() => (profile ? draftFromProfile(profile) : null), [profile]);
  const dirty = Boolean(baseline && draft && !draftsEqual(baseline, draft));

  const applyProfile = useCallback((next: AccountProfile) => {
    setProfile(next);
    setDraft(draftFromProfile(next));
  }, []);

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
      applyProfile(normalize((await response.json()).user));
      await loadProgress();
    } catch (error) {
      setProfile(null);
      setDraft(null);
      setLoadError(error instanceof Error ? error.message : 'Could not load profile');
    } finally {
      setLoading(false);
    }
  }, [applyProfile, isAuthenticated, loadProgress]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetch('/api/users/me/reset', { cache: 'no-store' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => setTestResetEnabled(Boolean(body?.enabled)))
      .catch(() => setTestResetEnabled(false));
  }, [isAuthenticated]);

  useEffect(() => {
    const fromHash = window.location.hash.replace('#', '') as Section;
    if (SECTIONS.some((item) => item.id === fromHash)) setSection(fromHash);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [dirty]);

  function selectSection(next: Section) {
    setSection(next);
    window.history.replaceState(null, '', next === 'profile' ? window.location.pathname : `#${next}`);
  }

  const save = useCallback(async () => {
    if (!profile || !draft || !baseline || saving) return;
    const changes: Record<string, unknown> = {};
    (Object.keys(draft) as Array<keyof ProfileDraft>).forEach((key) => {
      const before = baseline[key];
      const after = draft[key];
      const same = Array.isArray(before) && Array.isArray(after)
        ? before.length === after.length && before.every((value) => (after as string[]).includes(value))
        : before === after;
      if (!same) changes[key] = typeof after === 'string' ? after.trim() : after;
    });
    if (Object.keys(changes).length === 0) return;

    setSaving(true);
    try {
      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
        body: JSON.stringify(changes),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Update failed');
      applyProfile(normalize((await response.json()).user));
      await refresh();
      toast.success('Profile saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }, [applyProfile, baseline, draft, profile, refresh, saving]);

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

  if (loadError) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center" role="alert">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-500"><ShieldAlert className="h-5 w-5" /></span>
        <h1 className="mt-4 text-base font-semibold">Profile unavailable</h1>
        <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" className="mt-5" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Retry</Button>
      </div>
    );
  }

  if (!profile || !draft) {
    return (
      <div className="mx-auto max-w-5xl space-y-4" aria-busy="true">
        <div className="h-44 animate-pulse rounded-2xl border bg-muted/40" />
        <div className="h-96 animate-pulse rounded-2xl border bg-muted/30" />
      </div>
    );
  }

  const completeness = profileCompleteness(profile);
  const experience = EXPERIENCE_LEVELS.find((level) => level.id === profile.experienceLevel);
  const since = memberSince(profile.createdAt);
  const previewAvatar = draft.avatarUrl || profile.avatarUrl;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="relative overflow-hidden rounded-2xl border bg-card" aria-label="Operator profile">
        <div className="h-24 bg-gradient-to-r from-primary/30 via-primary/10 to-sky-500/20 sm:h-28" aria-hidden="true">
          <div className="h-full w-full bg-[linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] bg-[size:24px_24px]" />
        </div>
        <div className="px-5 pb-5 sm:px-6">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-card bg-gradient-to-br from-primary/30 to-primary/10 text-2xl font-semibold text-primary shadow-lg">
              {previewAvatar ? <img src={previewAvatar} alt="" className="h-full w-full object-cover" /> : initials(draft.displayName || profile.displayName)}
            </span>
            <div className="ml-auto flex items-center gap-2 pb-1">
              {profile.role === 'admin' ? (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link href="/admin"><ShieldCheck className="h-4 w-4" /> Platform console</Link>
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" className="h-8" onClick={() => void load()} disabled={loading} aria-label="Refresh profile">
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{profile.displayName}</h1>
                {profile.isFounder ? (
                  <span className="inline-flex h-6 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300"><Crown className="h-3 w-3" /> Founder</span>
                ) : profile.role === 'admin' ? (
                  <span className="inline-flex h-6 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 text-[11px] font-semibold text-primary"><ShieldCheck className="h-3 w-3" /> Admin</span>
                ) : null}
                {profile.emailVerified ? <BadgeCheck className="h-5 w-5 text-sky-500" aria-label="Verified email" /> : null}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{profile.headline || experience?.label || 'Add a headline so collaborators know your focus.'}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {profile.email ? <span>{profile.email}</span> : null}
                {profile.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{profile.location}</span> : null}
                {profile.websiteUrl ? (
                  <a href={profile.websiteUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground"><Globe className="h-3 w-3" />{profile.websiteUrl.replace(/^https:\/\//, '').replace(/\/$/, '')}</a>
                ) : null}
                {since ? <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />Member since {since}</span> : null}
              </div>
              {profile.focusAreas.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {profile.focusAreas.map((id) => (
                    <span key={id} className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium">{FOCUS_AREAS.find((area) => area.id === id)?.label || id}</span>
                  ))}
                </div>
              ) : null}
            </div>

            {completeness.percent < 100 ? (
              <button
                type="button"
                onClick={() => selectSection('profile')}
                className="flex items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2 text-left transition hover:border-primary/40"
              >
                <span className="relative">
                  <CompletenessRing percent={completeness.percent} />
                  <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold tabular-nums">{completeness.percent}%</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">Complete your profile</span>
                  <span className="block max-w-[14rem] truncate text-[11px] text-muted-foreground">Next: {completeness.missing.slice(0, 2).map((item) => item.label.toLowerCase()).join(', ')}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ) : null}
          </div>

          {progress ? (
            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5" aria-label="Operator progress summary">
              {[
                { label: 'Level', value: progress.rewards.level, sub: progress.rewards.levelName, icon: Zap },
                { label: 'XP', value: progress.rewards.xp, sub: `${progress.rewards.levelProgressPercent}% to next`, icon: Award },
                { label: 'Labs', value: progress.labs.started, sub: `${progress.labs.running} active now`, icon: FlaskConical },
                { label: 'Badges', value: progress.rewards.badgesEarned, sub: 'earned', icon: BadgeCheck },
                { label: 'Streak', value: progress.activity.streakDays, sub: 'active days', icon: CalendarDays },
              ].map((metric) => (
                <div key={metric.label} className="bg-card px-3 py-3">
                  <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"><metric.icon className="h-3 w-3" />{metric.label}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{metric.value}</dd>
                  <dd className="truncate text-[11px] text-muted-foreground">{metric.sub}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        {profileError ? <div className="border-t bg-amber-500/5 px-6 py-2 text-xs text-amber-700 dark:text-amber-300">Profile is syncing.</div> : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Account sections">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            const active = item.id === section;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectSection(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition',
                  active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <Icon className={cn('h-4 w-4', active && 'text-primary')} />
                {item.label}
                {item.id === 'profile' && dirty ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Unsaved changes" /> : null}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {section === 'profile' && (
            <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="profile-title">
              <h2 id="profile-title" className="text-base font-semibold">Public profile</h2>
              <p className="mb-5 mt-0.5 text-xs text-muted-foreground">Shown to collaborators in sessions, boards and live workspaces.</p>
              <ProfileEditor
                draft={draft}
                onChange={setDraft}
                dirty={dirty}
                saving={saving}
                onSave={() => void save()}
                onDiscard={() => baseline && setDraft(baseline)}
              />
            </section>
          )}

          {section === 'progress' && (
            <div className="space-y-4">
              {progress ? (
                <>
                  <section className="rounded-2xl border bg-card p-5"><ProgressBadgeRail progress={progress} /></section>
                  <section className="rounded-2xl border bg-card p-5"><LearningAnalyticsDashboard progress={progress} compact /></section>
                </>
              ) : (
                <section className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
                  Progress appears after your first lesson or lab. <Link href="/academy" className="font-medium text-primary hover:underline">Start in Academy</Link>
                </section>
              )}
              <section className="rounded-2xl border bg-card p-5"><VillainBadgeGrid /></section>
            </div>
          )}

          {section === 'security' && (
            <section className="space-y-3 rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="security-title">
              <h2 id="security-title" className="text-base font-semibold">Sign-in &amp; security</h2>
              <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-4">
                <span className="grid h-9 w-9 place-items-center rounded-lg border bg-background"><BadgeCheck className={cn('h-4 w-4', profile.emailVerified ? 'text-sky-500' : 'text-muted-foreground')} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{profile.email || 'No email on file'}</p>
                  <p className="text-xs text-muted-foreground">{profile.emailVerified ? 'Verified primary email' : 'Email not verified yet'}</p>
                </div>
              </div>
              <Link href="/account/security" className="group flex items-center gap-3 rounded-xl border p-4 transition hover:border-primary/40 hover:bg-muted/20">
                <span className="grid h-9 w-9 place-items-center rounded-lg border bg-background"><KeyRound className="h-4 w-4 text-primary" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Passwords, passkeys, two-factor and sessions</p>
                  <p className="text-xs text-muted-foreground">Manage how you sign in and sign out other devices.</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </Link>
            </section>
          )}

          {section === 'data' && (
            <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="data-title">
              <h2 id="data-title" className="mb-4 text-base font-semibold">Data &amp; privacy</h2>
              <AccountDataPanel testResetEnabled={testResetEnabled} onSignedOut={logout} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
