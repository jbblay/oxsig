"use client";

import * as React from "react";
import Link from "next/link";
import { Copy, Eye, Fingerprint, KeyRound, Loader2, LockKeyhole, ShieldCheck, UserCircle } from "lucide-react";
import { toast } from "sonner";
import ProfilePage from "@/app/profile/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type IdentityProfile = {
  publicKey: string;
  email: string | null;
  displayName: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
};

function IdentityAccessPanel() {
  const [profile, setProfile] = React.useState<IdentityProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    void fetch('/api/users/me', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load identity');
        setProfile((await response.json()).user);
      })
      .catch(() => toast.error('Could not load identity information'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5" />Account identity</CardTitle><CardDescription>Identity values returned by the authenticated backend.</CardDescription></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div><p className="text-muted-foreground">Display name</p><p className="font-medium">{profile?.displayName || 'OXSIG user'}</p></div>
          <div><p className="text-muted-foreground">Email</p><div className="flex items-center gap-2"><p className="font-medium">{profile?.email || 'DID-only account'}</p><Badge variant={profile?.emailVerified ? 'default' : 'secondary'}>{profile?.emailVerified ? 'Verified' : 'Not verified'}</Badge></div></div>
          {profile?.publicKey ? <div><p className="text-muted-foreground">Public identity key</p><div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1">{profile.publicKey}</code><Button size="icon" variant="outline" onClick={() => { void navigator.clipboard.writeText(profile.publicKey); toast.success('Public key copied'); }}><Copy className="h-4 w-4" /></Button></div><p className="mt-2 text-xs text-muted-foreground">This is an account key. OXSIG does not claim it is a government identity or verified credential.</p></div> : <div className="rounded-lg border border-dashed p-3 text-muted-foreground">No DID/public key is attached to this email account.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Access methods</CardTitle><CardDescription>Manage genuine account protections rather than decorative trust scores.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Two-factor authentication</p><p className="text-xs text-muted-foreground">Additional login verification</p></div><Badge variant={profile?.twoFactorEnabled ? 'default' : 'secondary'}>{profile?.twoFactorEnabled ? 'Enabled' : 'Not enabled'}</Badge></div>
          <div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Passkeys and security keys</p><p className="text-xs text-muted-foreground">FIDO2/WebAuthn credentials</p></div><Button asChild size="sm" variant="outline"><Link href="/security">Manage</Link></Button></div>
          <div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Sessions and devices</p><p className="text-xs text-muted-foreground">Review and revoke account sessions</p></div><Badge variant="outline">Profile tab</Badge></div>
        </CardContent>
      </Card>
    </div>
  );
}

const privacyProtections = [
  { title: 'Secure Canvas is private by default', description: 'Only the owner and explicitly shared users can open a saved session.', status: 'Enforced', active: true },
  { title: 'Canvas access can be revoked', description: 'Owners can revoke viewer or editor access from the backend.', status: 'Enforced', active: true },
  { title: 'Recording access is authorized', description: 'Audio endpoints verify session ownership or an active share before returning data.', status: 'Enforced', active: true },
  { title: 'ShareDocs permission defaults', description: 'Unified file-level sharing and expiration controls are the next storage milestone.', status: 'In progress', active: false },
  { title: 'Recording retention', description: 'Custom deletion schedules are not implemented yet.', status: 'Planned', active: false },
];

function PrivacyPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5" />Privacy status</CardTitle><CardDescription>Only protections implemented and enforced by the backend are shown as active.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {privacyProtections.map((item) => <div key={item.title} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.description}</p></div><Badge variant={item.active ? 'default' : 'secondary'}>{item.status}</Badge></div></div>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" />Privacy principle</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">OXSIG does not advertise zero-knowledge proofs, anonymous credentials, or a privacy score because those systems are not currently implemented. Private means backend authorization, deliberate sharing, revocation, minimal audit metadata, and honest status reporting.</CardContent>
      </Card>
    </div>
  );
}

export default function AccountPage() {
  return (
    <div className="space-y-6">
      <div><div className="flex items-center gap-2"><UserCircle className="h-7 w-7 text-primary" /><h1 className="text-2xl font-bold md:text-3xl">Account</h1></div><p className="mt-1 text-sm text-muted-foreground">Your profile, verified access methods, sessions, and privacy controls in one place.</p></div>
      <Tabs defaultValue="profile">
        <TabsList className="grid h-auto w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="profile" className="gap-2"><UserCircle className="h-4 w-4" /><span className="hidden sm:inline">Profile</span></TabsTrigger>
          <TabsTrigger value="identity" className="gap-2"><Fingerprint className="h-4 w-4" /><span className="hidden sm:inline">Identity & Access</span><span className="sm:hidden">Identity</span></TabsTrigger>
          <TabsTrigger value="privacy" className="gap-2"><ShieldCheck className="h-4 w-4" /><span className="hidden sm:inline">Privacy</span></TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-5"><ProfilePage /></TabsContent>
        <TabsContent value="identity" className="mt-5"><IdentityAccessPanel /></TabsContent>
        <TabsContent value="privacy" className="mt-5"><PrivacyPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
