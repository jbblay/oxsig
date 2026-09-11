'use client';

import * as React from 'react';
import { SignedIn, SignedOut, SignInButton, SignUpButton } from '@clerk/nextjs';
import { CheckCircle2, LayoutPanelTop, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';

export default function StoryboardInviteAcceptance({ token }: { token: string }) {
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
      const response = await fetch(`/api/storyboards/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not accept Board invitation');
      setAccepted(true);
      window.setTimeout(
        () => router.push(`/collab/storyboards?session=${encodeURIComponent(body.sessionId)}`),
        700
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not accept Board invitation');
    } finally {
      setBusy(false);
    }
  }

  const returnUrl = `/board-invite/${encodeURIComponent(token)}`;

  return (
    <div className="mx-auto flex min-h-[65vh] max-w-xl items-center justify-center px-4 py-12">
      <Card className="w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {accepted ? <CheckCircle2 className="h-6 w-6" /> : <LayoutPanelTop className="h-6 w-6" />}
          </div>
          <CardTitle>{accepted ? 'Board access ready' : 'An OXSIG Board was shared with you'}</CardTitle>
          <CardDescription>
            {accepted
              ? 'Opening the shared Board…'
              : 'Use the email address that received this invitation, then accept access.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <SignedOut>
            <div className="grid gap-2 sm:grid-cols-2">
              <SignInButton mode="modal" forceRedirectUrl={returnUrl}>
                <Button variant="outline" className="w-full">Sign in</Button>
              </SignInButton>
              <SignUpButton mode="modal" forceRedirectUrl={returnUrl}>
                <Button className="w-full">Create account</Button>
              </SignUpButton>
            </div>
          </SignedOut>

          <SignedIn>
            <Button className="w-full" onClick={() => void acceptInvitation()} disabled={busy || accepted}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {accepted ? 'Accepted' : 'Accept Board invitation'}
            </Button>
          </SignedIn>
        </CardContent>
      </Card>
    </div>
  );
}
