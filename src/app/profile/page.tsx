"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { Activity, Copy, Loader2, LogIn, MonitorSmartphone, Pencil, Save, ShieldCheck, Trash2, UserCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth/use-auth";

type Profile = { id: string; publicKey: string; displayName: string; email: string | null; bio: string; avatarUrl: string; role: string; emailVerified: boolean; twoFactorEnabled: boolean; createdAt: string; lastSeenAt: string | null };
type Stats = { ownedStoryboards: number; sharedStoryboards: number; auditEvents: number; activeSessions: number };
type AuditActivity = { id: string; action: string; resourceType: string | null; createdAt: string };
type AccountSession = { id: string; name: string; ipAddress: string | null; createdAt: string; expiresAt: string };

async function getCsrfToken() {
  const response = await fetch("/api/csrf-token", { cache: "no-store", credentials: "include" });
  if (!response.ok) throw new Error("Could not initialize a secure request");
  return (await response.json()).token as string;
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body?.error || body?.message || fallback;
}

function relativeDate(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : formatDistanceToNow(date, { addSuffix: true });
}

export default function ProfilePage() {
  const { user, isLoading: authLoading, fetchUserProfile } = useAuth();
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [activities, setActivities] = React.useState<AuditActivity[]>([]);
  const [sessions, setSessions] = React.useState<AccountSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [displayName, setDisplayName] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState("");

  const loadProfile = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [profileResponse, statsResponse, activityResponse, sessionsResponse] = await Promise.all([
        fetch("/api/users/me", { cache: "no-store", credentials: "include" }),
        fetch("/api/users/me/stats", { cache: "no-store", credentials: "include" }),
        fetch("/api/users/me/activity?limit=8", { cache: "no-store", credentials: "include" }),
        fetch("/api/users/me/devices", { cache: "no-store", credentials: "include" }),
      ]);
      if (!profileResponse.ok) throw new Error(await readError(profileResponse, "Could not load profile"));
      const nextProfile = (await profileResponse.json()).user as Profile;
      setProfile(nextProfile);
      setDisplayName(nextProfile.displayName || ""); setBio(nextProfile.bio || ""); setAvatarUrl(nextProfile.avatarUrl || "");
      if (statsResponse.ok) setStats(await statsResponse.json());
      if (activityResponse.ok) setActivities((await activityResponse.json()).activities || []);
      if (sessionsResponse.ok) setSessions((await sessionsResponse.json()).devices || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load profile");
    } finally { setLoading(false); }
  }, [user]);

  React.useEffect(() => {
    if (!authLoading && user) void loadProfile();
    if (!authLoading && !user) setLoading(false);
  }, [authLoading, user, loadProfile]);

  const cancelEditing = () => {
    setDisplayName(profile?.displayName || ""); setBio(profile?.bio || ""); setAvatarUrl(profile?.avatarUrl || ""); setEditing(false);
  };

  const saveProfile = async () => {
    if (!displayName.trim()) return toast.error("Display name is required");
    setSaving(true);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch("/api/users/me", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ displayName: displayName.trim(), bio: bio.trim(), avatarUrl: avatarUrl.trim() }) });
      if (!response.ok) throw new Error(await readError(response, "Could not update profile"));
      setProfile((await response.json()).user as Profile); setEditing(false); await fetchUserProfile(); toast.success("Profile updated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update profile"); }
    finally { setSaving(false); }
  };

  const revokeSession = async (sessionId: string) => {
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/users/me/devices?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE", credentials: "include", headers: { "x-csrf-token": csrf } });
      if (!response.ok) throw new Error(await readError(response, "Could not revoke session"));
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      setStats((current) => current ? { ...current, activeSessions: Math.max(0, current.activeSessions - 1) } : current);
      toast.success("Session revoked");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not revoke session"); }
  };

  if (authLoading || loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <div className="flex min-h-[60vh] items-center justify-center px-4"><Card className="w-full max-w-md text-center"><CardHeader><UserCircle className="mx-auto h-12 w-12 text-muted-foreground" /><CardTitle>Authentication required</CardTitle><CardDescription>Sign in to view and manage your OXSIG account.</CardDescription></CardHeader><CardContent><Button onClick={() => { window.location.href = "/?redirect=/account"; }}><LogIn className="mr-2 h-4 w-4" />Go to sign in</Button></CardContent></Card></div>;

  const initials = (profile?.displayName || profile?.email || "OX").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const statCards = [["Secure boards", stats?.ownedStoryboards ?? 0], ["Shared with me", stats?.sharedStoryboards ?? 0], ["Audit events", stats?.auditEvents ?? 0], ["Active sessions", stats?.activeSessions ?? sessions.length]] as const;

  return <div className="space-y-6 pb-12">
    <Card className="overflow-hidden"><div className="h-24 bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700" /><CardContent className="relative px-5 pb-6 pt-14 sm:px-8">
      <Avatar className="absolute -top-12 h-24 w-24 border-4 border-background"><AvatarImage src={profile?.avatarUrl || undefined} alt={profile?.displayName || "Profile"} /><AvatarFallback className="text-xl">{initials}</AvatarFallback></Avatar>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{profile?.displayName || "OXSIG user"}</h1><Badge variant="outline">{profile?.role || "user"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{profile?.email || "DID account"}</p>{profile?.bio && <p className="mt-3 max-w-2xl text-sm">{profile.bio}</p>}</div>
        <Button variant={editing ? "outline" : "default"} onClick={() => editing ? cancelEditing() : setEditing(true)}>{editing ? <><X className="mr-2 h-4 w-4" />Cancel</> : <><Pencil className="mr-2 h-4 w-4" />Edit profile</>}</Button></div>
    </CardContent></Card>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statCards.map(([label, value]) => <Card key={label}><CardContent className="pt-5"><div className="text-2xl font-bold">{value}</div><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>)}</div>

    {editing && <Card><CardHeader><CardTitle>Edit profile</CardTitle><CardDescription>Your email and account identity cannot be changed from this form.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="display-name">Display name</Label><Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} /></div><div className="space-y-2"><Label htmlFor="avatar-url">Avatar URL</Label><Input id="avatar-url" type="url" placeholder="https://…" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} maxLength={2000} /></div></div><div className="space-y-2"><Label htmlFor="profile-bio">Bio</Label><textarea id="profile-bio" className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} /><p className="text-right text-xs text-muted-foreground">{bio.length}/500</p></div><Button onClick={saveProfile} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save changes</Button></CardContent></Card>}

    <Tabs defaultValue="overview"><TabsList className="grid w-full max-w-lg grid-cols-3"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="security">Security</TabsTrigger><TabsTrigger value="sessions">Sessions</TabsTrigger></TabsList>
      <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><UserCircle className="h-5 w-5" />Account</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div><p className="text-muted-foreground">Member since</p><p>{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "Unknown"}</p></div><div><p className="text-muted-foreground">Last seen</p><p>{relativeDate(profile?.lastSeenAt)}</p></div>{profile?.publicKey && <div><p className="text-muted-foreground">Public identity key</p><div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1">{profile.publicKey}</code><Button size="icon" variant="outline" onClick={() => { void navigator.clipboard.writeText(profile.publicKey); toast.success("Public key copied"); }}><Copy className="h-4 w-4" /></Button></div></div>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Recent security activity</CardTitle><CardDescription>Real audit events recorded by the backend.</CardDescription></CardHeader><CardContent className="space-y-3">{activities.length === 0 ? <p className="text-sm text-muted-foreground">No audit events recorded yet.</p> : activities.map((item) => <div key={item.id} className="flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"><div><p className="text-sm font-medium">{item.action.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{item.resourceType || "account"}</p></div><span className="shrink-0 text-xs text-muted-foreground">{relativeDate(item.createdAt)}</span></div>)}</CardContent></Card></TabsContent>
      <TabsContent value="security" className="mt-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Account protections</CardTitle><CardDescription>Only protections backed by current account data are shown as enabled.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><div className="flex items-center justify-between rounded-lg border p-4"><div><p className="font-medium">Email verification</p><p className="text-xs text-muted-foreground">Confirms control of the account email.</p></div><Badge variant={profile?.emailVerified ? "default" : "secondary"}>{profile?.emailVerified ? "Verified" : "Not verified"}</Badge></div><div className="flex items-center justify-between rounded-lg border p-4"><div><p className="font-medium">Two-factor authentication</p><p className="text-xs text-muted-foreground">Additional sign-in verification.</p></div><Badge variant={profile?.twoFactorEnabled ? "default" : "secondary"}>{profile?.twoFactorEnabled ? "Enabled" : "Not enabled"}</Badge></div></CardContent></Card></TabsContent>
      <TabsContent value="sessions" className="mt-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><MonitorSmartphone className="h-5 w-5" />Active account sessions</CardTitle><CardDescription>Revoking the current session may sign this browser out when its access token expires.</CardDescription></CardHeader><CardContent className="space-y-3">{sessions.length === 0 ? <p className="text-sm text-muted-foreground">No active sessions found.</p> : sessions.map((session) => <div key={session.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-medium">{session.name}</p><p className="text-xs text-muted-foreground">{session.ipAddress || "IP unavailable"} · started {relativeDate(session.createdAt)} · expires {relativeDate(session.expiresAt)}</p></div><Button variant="outline" size="sm" onClick={() => void revokeSession(session.id)}><Trash2 className="mr-2 h-4 w-4" />Revoke</Button></div>)}</CardContent></Card></TabsContent>
    </Tabs>
  </div>;
}
