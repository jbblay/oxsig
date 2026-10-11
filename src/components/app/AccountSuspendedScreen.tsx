'use client';

import { LifeBuoy, LogOut, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';

export const SUPPORT_URL = 'https://clinode.com/support';

/** Replaces the workspace when the platform team has paused this account. */
export default function AccountSuspendedScreen() {
  const { accountStatusMessage, logout } = useAuth();
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4" role="alert">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Your account is paused</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {accountStatusMessage || 'The OXSIG platform team has paused access to this account.'} Your data is safe and nothing has been deleted.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild>
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer"><LifeBuoy className="h-4 w-4" /> Contact support</a>
          </Button>
          <Button variant="outline" onClick={() => void logout()}><LogOut className="h-4 w-4" /> Sign out</Button>
        </div>
      </div>
    </div>
  );
}
