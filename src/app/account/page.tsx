'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Award,
  FlaskConical,
  Gauge,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import ProgressBadgeRail from '@/components/app/ProgressBadgeRail';
import VillainBadgeGrid from '@/components/profile/VillainBadgeGrid';
import { LearningAnalyticsDashboard } from '@/components/learning/LearningAnalyticsDashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/use-auth';
import type { LearnerProgressSummary } from '@/lib/learning/progress-contract';
import { getCsrfToken } from '@/lib/security/csrf-client';
import styles from './operator-profile.module.css';

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
const RESET_CONFIRMATION = 'RESET MY OXSIG DATA';

function initials(value?: string) {
  const parts = (value || 'O').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'O';
}

export default function AccountPage() {
  const { isAuthenticated, isLoading: authLoading, profileError, refresh, logout } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<LearnerProgressSummary | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testResetEnabled, setTestResetEnabled] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetting, setResetting] = useState(false);

  const dirty = useMemo(() => Boolean(
    profile && (
      displayName !== (profile.displayName || '') ||
      bio !== (profile.bio || '') ||
      avatarUrl !== (profile.avatarUrl || '')
    )
  ), [avatarUrl, bio, displayName, profile]);

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
      setAvatarUrl(next.avatarUrl || '');
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
    if (!isAuthenticated) return;
    void fetch('/api/users/me/reset', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => setTestResetEnabled(Boolean(body?.enabled)))
      .catch(() => setTestResetEnabled(false));
  }, [isAuthenticated]);

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
        body: JSON.stringify({ displayName: displayName.trim(), bio: bio.trim(), avatarUrl: avatarUrl.trim() }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Update failed');
      const next = (await response.json()).user as Profile;
      setProfile(next);
      setDisplayName(next.displayName || '');
      setBio(next.bio || '');
      setAvatarUrl(next.avatarUrl || '');
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

  async function resetTestAccount() {
    if (resetText !== RESET_CONFIRMATION || resetting) return;
    setResetting(true);
    try {
      const response = await fetch('/api/users/me/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
        body: JSON.stringify({ confirmation: RESET_CONFIRMATION }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Test-account reset failed');
      for (const key of UI_PREFERENCE_KEYS) window.localStorage.removeItem(key);
      await logout();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Test-account reset failed');
      setResetting(false);
    }
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
    <div className="mx-auto max-w-6xl">
      <section className={`dark ${styles.shell}`} aria-label="OXSIG operator profile">
        <div className={styles.topRail}>
          <span className={styles.liveDot} aria-hidden="true" />
          <UserRound className="h-4 w-4 text-cyan-300" />
          <span className={styles.kicker}>OXSIG // Operator profile</span>
          <div className={styles.railMeta}>
            <span>Identity linked</span>
            <span>{profile?.role || 'member'}</span>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto h-8 text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {profileError && <div className={styles.notice}>Profile is syncing.</div>}

        <div className={styles.body}>
          <div className={styles.stack}>
            {loading && !profile ? (
              <div className={styles.panel}>
                <div className="flex items-center justify-center py-16 text-sm text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading operator record…</div>
              </div>
            ) : loadError ? (
              <div className={`${styles.panel} ${styles.errorPanel}`}>
                <div className={styles.panelTitle}><ShieldCheck className="h-4 w-4 text-rose-300" /> Profile unavailable</div>
                <p className="mb-4 text-sm text-slate-400">{loadError}</p>
                <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Retry</Button>
              </div>
            ) : profile ? (
              <>
                <div className={styles.identityHero}>
                  <div className={styles.avatarFrame}>
                    {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className={styles.avatarImage} /> : initials(profile.displayName)}
                  </div>
                  <div className={styles.identityMeta}>
                    <p className={styles.eyebrow}>Authenticated operator</p>
                    <h1 className={styles.name}>{profile.displayName}</h1>
                    <p className={styles.email}>{profile.email || 'OXSIG identity'}</p>
                    <div className={styles.badges}>
                      <span className={styles.statusBadge}><Activity className="h-3 w-3" /> Active</span>
                      <span className={styles.badge}><ShieldCheck className="h-3 w-3" /> {profile.role || 'member'}</span>
                      <span className={styles.badge}>{profile.bio?.trim() ? 'Profile ready' : 'Bio pending'}</span>
                    </div>
                    <p className={styles.bio}>{profile.bio?.trim() || 'Add a short technical bio so collaborators know your focus.'}</p>
                  </div>
                </div>

                {progress && (
                  <div className={styles.metricGrid} aria-label="Operator progress summary">
                    <div className={styles.metric}><div className={styles.metricLabel}>Level</div><div className={styles.metricValue}>{progress.rewards.level}</div><div className={styles.metricSub}>{progress.rewards.levelName}</div></div>
                    <div className={styles.metric}><div className={styles.metricLabel}>XP</div><div className={styles.metricValue}>{progress.rewards.xp}</div><div className={styles.metricSub}>{progress.rewards.levelProgressPercent}% to next level</div></div>
                    <div className={styles.metric}><div className={styles.metricLabel}>Labs</div><div className={styles.metricValue}>{progress.labs.started}</div><div className={styles.metricSub}>{progress.labs.running} active now</div></div>
                    <div className={styles.metric}><div className={styles.metricLabel}>Insignia</div><div className={styles.metricValue}>{progress.rewards.badgesEarned}</div><div className={styles.metricSub}>earned badges</div></div>
                    <div className={styles.metric}><div className={styles.metricLabel}>Streak</div><div className={styles.metricValue}>{progress.activity.streakDays}</div><div className={styles.metricSub}>active days</div></div>
                  </div>
                )}

                <div className={styles.panel}>
                  <div className={styles.panelTitle}>
                    <UserRound className="h-4 w-4 text-cyan-300" />
                    Identity record
                    <span>{dirty ? 'Unsaved changes' : 'Synced'}</span>
                  </div>
                  {dirty && <Badge variant="outline" className="mb-3 border-amber-400/20 bg-amber-400/5 text-amber-200">Unsaved</Badge>}
                  <div className={styles.identityForm}>
                    <div className={styles.avatarEditor}>
                      <div className={`${styles.avatarFrame} ${styles.avatarPreview}`}>
                        {avatarUrl ? <img src={avatarUrl} alt="Avatar preview" className={styles.avatarImage} /> : initials(displayName)}
                      </div>
                      <div className="min-w-0">
                        <label htmlFor="account-avatar-url" className={styles.label}>Avatar</label>
                        <Input id="account-avatar-url" type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value.slice(0, 2000))} maxLength={2000} placeholder="https://…" className="border-white/10 bg-black/20 text-slate-100 placeholder:text-slate-600" />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setAvatarUrl('')}>Use default avatar</Button>
                          <span className={styles.hint}>Image URL now; operator art can replace this later.</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="account-display-name" className={styles.label}>Display name</label>
                      <Input id="account-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 100))} maxLength={100} className="border-white/10 bg-black/20 text-slate-100" />
                      {displayName.trim().length > 0 && displayName.trim().length < 2 && <p className="mt-1 text-xs text-rose-300">Use at least 2 characters.</p>}
                    </div>

                    <div>
                      <label htmlFor="account-bio" className={styles.label}>Operator bio</label>
                      <Textarea id="account-bio" value={bio} onChange={(event) => setBio(event.target.value.slice(0, 500))} maxLength={500} rows={4} placeholder="Your technical focus, specialties or current mission interests." className="border-white/10 bg-black/20 text-slate-100 placeholder:text-slate-600" />
                      <p className={styles.counter}>{bio.length}/500</p>
                    </div>

                    <div className={styles.formActions}>
                      <Button disabled={saving || !dirty || displayName.trim().length < 2} onClick={() => void save()}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save
                      </Button>
                      {dirty && <Button variant="outline" disabled={saving} onClick={() => { setDisplayName(profile.displayName || ''); setBio(profile.bio || ''); setAvatarUrl(profile.avatarUrl || ''); }}>Discard</Button>}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <aside className={styles.stack} aria-label="Account and system controls">
            <div className={styles.sidePanel}>
              <div className={styles.sideHeader}>Account & system</div>
              <div className={styles.sideRow}><ShieldCheck className="h-4 w-4 text-emerald-300" /> Identity status <strong>Verified</strong></div>
              <div className={styles.sideRow}><Activity className="h-4 w-4 text-cyan-300" /> Profile state <strong>{profile?.bio?.trim() ? 'Ready' : 'Incomplete'}</strong></div>
              <div className={styles.sideRow}><Gauge className="h-4 w-4 text-blue-300" /> Interface <strong>OXSIG</strong></div>
            </div>

            {progress && (
              <div className={styles.sidePanel}>
                <div className={styles.sideHeader}>Operator telemetry</div>
                <div className={styles.sideRow}><Zap className="h-4 w-4 text-cyan-300" /> Current level <strong>{progress.rewards.level}</strong></div>
                <div className={styles.sideRow}><FlaskConical className="h-4 w-4 text-emerald-300" /> Lab runtime <strong>{progress.labs.runtimeMinutes}m</strong></div>
                <div className={styles.sideRow}><Award className="h-4 w-4 text-amber-300" /> Mastery <strong>{progress.academy.averageMastery}%</strong></div>
              </div>
            )}

            <div className={styles.panel}>
              <div className={styles.panelTitle}><Settings2 className="h-4 w-4 text-blue-300" /> Interface controls</div>
              <p className="mb-3 text-[10px] leading-5 text-slate-500">Reset local OXSIG layout preferences without changing your profile, progress or account data.</p>
              <Button variant="outline" className="w-full" onClick={resetInterface}><RotateCcw className="h-4 w-4" /> Reset interface</Button>
            </div>

            {testResetEnabled && (
              <div className={`${styles.panel} ${styles.dangerPanel}`}>
                <div className={styles.panelTitle}><Trash2 className="h-4 w-4 text-rose-300" /> Danger zone</div>
                <p className={styles.dangerText}>Terminates active OXSIG cloud resources, removes your OXSIG-owned data and signs you out. Your Clerk login remains.</p>
                <p className="mt-3 text-[9px] text-slate-500">Type <span className={styles.resetPhrase}>{RESET_CONFIRMATION}</span> to continue.</p>
                <Input value={resetText} onChange={(event) => setResetText(event.target.value)} disabled={resetting} aria-label="Test account reset confirmation" className="mt-2 border-rose-400/20 bg-black/20 text-slate-100" />
                <Button variant="destructive" className="mt-3 w-full" disabled={resetting || resetText !== RESET_CONFIRMATION} onClick={() => void resetTestAccount()}>
                  {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Reset test account
                </Button>
              </div>
            )}
          </aside>
        </div>

        {progress && (
          <div className={styles.progressSurface}>
            <p className={styles.surfaceLabel}>Progress signal</p>
            <ProgressBadgeRail progress={progress} />
          </div>
        )}

        <div className={styles.badgeSurface}>
          <p className={styles.surfaceLabel}>Operator insignia</p>
          <VillainBadgeGrid />
        </div>

        {progress && (
          <details className={styles.analytics}>
            <summary>
              <span>Learning telemetry</span>
              <span className="text-slate-500">Open analytics</span>
            </summary>
            <div className={styles.analyticsBody}>
              <LearningAnalyticsDashboard progress={progress} compact />
            </div>
          </details>
        )}

        <div className={styles.footerRail}>
          <strong>Identity</strong>
          <span>Profile = who you are</span>
          <span>Insignia = what you have earned</span>
          <span>System controls stay secondary</span>
        </div>
      </section>
    </div>
  );
}
