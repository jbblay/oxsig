'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Cloud, Loader2, LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { authPathWithReturnTo } from '@/lib/auth-return';
import { useAuth } from '@/lib/auth/use-auth';
import { invalidateLabsSnapshot } from '@/lib/labs/client';
import { getCsrfToken } from '@/lib/security/csrf-client';
import type { OperationMode } from '@/lib/operations/catalog';

type Props = {
  slug: string;
  mode: OperationMode;
  capabilityId?: string;
  variant?: 'default' | 'outline';
  className?: string;
  label?: string;
};

export function OperationLaunchButton({ slug, mode, capabilityId, variant = 'default', className, label }: Props) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [gateOpen, setGateOpen] = React.useState(false);
  const returnTo = React.useMemo(() => {
    const query = new URLSearchParams({ operation: slug });
    if (capabilityId) query.set('capability', capabilityId);
    return `/operations?${query.toString()}`;
  }, [capabilityId, slug]);

  const launch = async () => {
    if (busy || authLoading) return;
    if (!isAuthenticated) {
      setGateOpen(true);
      return;
    }

    setBusy(true);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/operations/${encodeURIComponent(slug)}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ mode }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not start Operation');
      const runId = body?.run?.runId as string | undefined;
      if (!runId) throw new Error('Operation runtime was created without a run id.');
      const reused = body?.reused === true;
      invalidateLabsSnapshot();

      let workspaceId: string | undefined;
      if (mode === 'warroom') {
        try {
          const workspaceResponse = await fetch(`/api/warroom/runs/${encodeURIComponent(runId)}/workspace`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
          });
          const workspaceBody = await workspaceResponse.json().catch(() => ({}));
          if (workspaceResponse.ok && typeof workspaceBody?.workspaceId === 'string') {
            workspaceId = workspaceBody.workspaceId;
          } else {
            toast.warning('Operation started. WarRoom will finish linking the team workspace when it opens.');
          }
        } catch {
          toast.warning('Operation started. WarRoom will finish linking the team workspace when it opens.');
        }
      }

      toast.success(reused ? 'Opening your active Operation.' : 'Operation topology is provisioning.');
      const destination = mode === 'warroom' ? '/warroom' : '/labs';
      const query = new URLSearchParams({ operation: slug, mode, run: runId });
      if (workspaceId) query.set('workspace', workspaceId);
      if (capabilityId) query.set('capability', capabilityId);
      router.push(`${destination}?${query.toString()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start Operation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant={variant} className={className} onClick={() => void launch()} disabled={busy || authLoading}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {busy ? 'Provisioning…' : label || (mode === 'warroom' ? 'WarRoom' : 'Start')}
        {!busy && mode !== 'warroom' ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
      </Button>

      <Dialog open={gateOpen} onOpenChange={setGateOpen}>
        <DialogContent className="border-cyan-500/20 bg-slate-950 text-slate-100 sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300">
              <Cloud className="h-5 w-5" />
            </div>
            <DialogTitle>Your environment is ready to be created</DialogTitle>
            <DialogDescription className="text-slate-400">
              You have reached the point where OXSIG needs an identity. Create an account to provision the real isolated runtime and keep what happens next.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 text-xs text-slate-300">
            <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> Provision the live technical environment</span>
            <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> Resume progress and preserve evidence</span>
            <span className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> Join team operations and protected AI actions</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500"><LockKeyhole className="h-3.5 w-3.5" /> Browsing and mission briefings remain available without an account.</div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button asChild variant="outline" className="border-white/15 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08] hover:text-white">
              <Link href={authPathWithReturnTo('/sign-in', returnTo)}>Log in</Link>
            </Button>
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              <Link href={authPathWithReturnTo('/sign-up', returnTo)}>Create account <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
