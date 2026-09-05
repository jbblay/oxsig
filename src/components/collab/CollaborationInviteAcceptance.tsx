'use client';

import * as React from 'react';
import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';
import { CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';

export default function CollaborationInviteAcceptance({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [accepted, setAccepted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function acceptInvitation() {
    if (busy || accepted) return;
    setBusy(true);
    setError(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/collaborations/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not accept collaboration invitation');
      setAccepted(true);
      window.setTimeout(() => router.push('/collab'), 700);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not accept collaboration invitation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[65vh] max-w-xl items-center justify-center px-4 py-12">
      <Card className="w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {accepted ? <CheckCircle2 className="h-6 w-6" /> : <MailCheck className="h-6 w-6" />}
          </div>
          <CardTitle>{accepted ? 'Invitation accepted' : 'OXSIG collaboration invitation'}</CardTitle>
          <CardDescription>
            {accepted
              ? 'Your collaboration access is ready. Opening the workspace…'
              : 'Sign in with the email address that received this invitation, then accept it.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

          <SignedOut>
            <SignInButton mode="modal" forceRedirectUrl={`/collab/invite/${encodeURIComponent(token)}`}>
              <Button className="w-full">Sign in to continue</Button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <Button className="w-full" onClick={() => void acceptInvitation()} disabled={busy || accepted}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {accepted ? 'Accepted' : 'Accept invitation'}
            </Button>
          </SignedIn>
        </CardContent>
      </Card>
    </div>
  );
}
