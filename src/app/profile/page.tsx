'use client';

import * as React from 'react';
import { Calendar, Loader2, Mail, Save, Shield, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth/use-auth';

interface Profile {
  id: string;
  displayName: string | null;
  email: string;
  bio: string | null;
  role: string;
  createdAt: string;
}

export default function ProfilePage() {
  const { fetchUserProfile } = useAuth();
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [form, setForm] = React.useState({ displayName: '', email: '', bio: '' });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/users/me', { credentials: 'include' });
        if (!response.ok) throw new Error('Unable to load profile');
        const data = await response.json();
        const nextProfile = data.user as Profile;
        setProfile(nextProfile);
        setForm({
          displayName: nextProfile.displayName || '',
          email: nextProfile.email || '',
          bio: nextProfile.bio || '',
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load profile');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save profile');
      setProfile(data.user);
      await fetchUserProfile();
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div className="flex items-center gap-3"><UserCircle className="h-9 w-9 text-primary" /><div><h1 className="text-3xl font-bold tracking-tight">Profile</h1><p className="text-muted-foreground">Manage the identity attached to your signing records.</p></div></div>

      {profile && (
        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
            <div className="flex items-center gap-3"><Mail className="h-5 w-5 text-muted-foreground" /><div className="min-w-0"><p className="text-xs text-muted-foreground">Email</p><p className="truncate text-sm font-medium">{profile.email}</p></div></div>
            <div className="flex items-center gap-3"><Shield className="h-5 w-5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Role</p><Badge variant="secondary">{profile.role}</Badge></div></div>
            <div className="flex items-center gap-3"><Calendar className="h-5 w-5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Member since</p><p className="text-sm font-medium">{new Date(profile.createdAt).toLocaleDateString()}</p></div></div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Account details</CardTitle><CardDescription>These details are used on new signature records.</CardDescription></CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={save}>
            <div className="space-y-2"><Label htmlFor="displayName">Display name</Label><Input id="displayName" value={form.displayName} maxLength={100} onChange={(event) => setForm((value) => ({ ...value, displayName: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={form.email} maxLength={320} required onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="bio">Bio</Label><Textarea id="bio" value={form.bio} maxLength={500} rows={5} onChange={(event) => setForm((value) => ({ ...value, bio: event.target.value }))} /><p className="text-right text-xs text-muted-foreground">{form.bio.length}/500</p></div>
            <Button type="submit" disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
