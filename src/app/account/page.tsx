'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Save, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/use-auth';

type Profile = { id: string; displayName: string; email?: string; bio?: string; avatarUrl?: string; role?: string };

async function csrfToken() {
  const response = await fetch('/api/csrf-token', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not prepare secure request');
  return (await response.json()).token as string;
}

export default function AccountPage() {
  const { isAuthenticated, isLoading: authLoading, profileError, refresh } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const response = await fetch('/api/users/me', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Profile service returned ${response.status}`);
      const next = (await response.json()).user as Profile;
      setProfile(next); setDisplayName(next.displayName || ''); setBio(next.bio || '');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load profile'); }
    finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setLoading(true);
    try {
      const response = await fetch('/api/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-csrf-token': await csrfToken() }, body: JSON.stringify({ displayName, bio }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Update failed');
      const next = (await response.json()).user as Profile;
      setProfile(next); await refresh(); toast.success('Profile updated');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Update failed'); }
    finally { setLoading(false); }
  }

  if (authLoading) return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (!isAuthenticated) return <Card className="mx-auto max-w-md"><CardHeader><CardTitle>Account</CardTitle><CardDescription>Sign in to manage your Oxsig profile.</CardDescription></CardHeader><CardContent><Button asChild><Link href="/sign-in">Sign in</Link></Button></CardContent></Card>;

  return (
    <div className="mx-auto max-w-2xl space-y-6"><div><div className="flex items-center gap-2"><User className="h-7 w-7" /><h1 className="text-3xl font-semibold">Account</h1></div><p className="mt-1 text-muted-foreground">Your Clerk identity mapped to your Oxsig workspace profile.</p></div>
      {profileError && <Card><CardContent className="pt-6 text-sm text-amber-600">Clerk is signed in, but the internal profile mapping has a problem: {profileError}</CardContent></Card>}
      <Card><CardHeader><CardTitle>Profile</CardTitle><CardDescription>{profile?.email || 'Loading account identity…'}{profile?.role ? ` · ${profile.role}` : ''}</CardDescription></CardHeader><CardContent className="space-y-4"><div><label className="mb-1 block text-sm font-medium">Display name</label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">Bio</label><Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={5} /></div><Button disabled={loading || !profile} onClick={() => void save()}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save</Button></CardContent></Card>
    </div>
  );
}
