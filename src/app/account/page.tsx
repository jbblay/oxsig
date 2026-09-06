'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, Save, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/use-auth';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Profile = { id: string; displayName: string; email?: string; bio?: string; avatarUrl?: string; role?: string };

export default function AccountPage() {
  const { isAuthenticated, isLoading: authLoading, profileError, refresh } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dirty = useMemo(() => Boolean(
    profile && (displayName !== (profile.displayName || '') || bio !== (profile.bio || ''))
  ), [bio, displayName, profile]);

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
    } catch (error) {
      setProfile(null);
      setLoadError(error instanceof Error ? error.message : 'Could not load profile');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

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

  if (authLoading) return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (!isAuthenticated) return <Card className="mx-auto max-w-md"><CardHeader><CardTitle>Account</CardTitle><CardDescription>Sign in to manage your Oxsig profile.</CardDescription></CardHeader><CardContent><Button asChild><Link href="/sign-in">Sign in</Link></Button></CardContent></Card>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2"><User className="h-7 w-7" /><h1 className="text-3xl font-semibold">Account</h1></div>
        <p className="mt-1 text-muted-foreground">Your Clerk identity mapped to your Oxsig workspace profile.</p>
      </div>

      {profileError && <Card><CardContent className="pt-6 text-sm text-amber-600">Clerk is signed in, but the internal profile mapping has a problem: {profileError}</CardContent></Card>}

      {loading ? (
        <Card><CardContent className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading account profile…</CardContent></Card>
      ) : loadError ? (
        <Card className="border-destructive/30">
          <CardHeader><CardTitle>Profile unavailable</CardTitle><CardDescription>Your signed-in identity is intact, but the Oxsig profile could not be loaded.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Try again</Button>
          </CardContent>
        </Card>
      ) : profile ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><CardTitle>Profile</CardTitle><CardDescription>{profile.email || 'Account identity'}{profile.role ? ` · ${profile.role}` : ''}</CardDescription></div>
              {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
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
              <Textarea id="account-bio" value={bio} onChange={(event) => setBio(event.target.value.slice(0, 500))} maxLength={500} rows={5} />
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
  );
}
