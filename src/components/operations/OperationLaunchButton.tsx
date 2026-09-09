'use client';

import * as React from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getCsrfToken } from '@/lib/security/csrf-client';
import type { OperationMode } from '@/lib/operations/catalog';

type Props = {
  slug: string;
  mode: OperationMode;
  variant?: 'default' | 'outline';
  className?: string;
  label?: string;
};

export function OperationLaunchButton({ slug, mode, variant = 'default', className, label }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const launch = async () => {
    if (busy) return;
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
      toast.success('Operation topology is provisioning.');
      const destination = mode === 'warroom' ? '/warroom' : '/labs';
      router.push(`${destination}?operation=${encodeURIComponent(slug)}&mode=${encodeURIComponent(mode)}&run=${encodeURIComponent(runId)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start Operation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" size="sm" variant={variant} className={className} onClick={() => void launch()} disabled={busy}>
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {busy ? 'Provisioning…' : label || (mode === 'warroom' ? 'WarRoom' : 'Start')}
      {!busy && mode !== 'warroom' ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
    </Button>
  );
}
