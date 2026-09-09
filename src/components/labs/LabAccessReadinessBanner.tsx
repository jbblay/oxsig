'use client';

import * as React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type LabInstance = { id: string; name: string; status: string };
type Diagnostics = { ec2State?: string; ssmRegistered?: boolean; ssmPingStatus?: string | null; ready?: boolean };

export default function LabAccessReadinessBanner() {
  const [instance, setInstance] = React.useState<LabInstance | null>(null);
  const [diagnostics, setDiagnostics] = React.useState<Diagnostics | null>(null);

  const refresh = React.useCallback(async () => {
    const labsResponse = await fetch('/api/labs', { cache: 'no-store' }).catch(() => null);
    if (!labsResponse?.ok) return;
    const labsBody = await labsResponse.json().catch(() => ({}));
    const current = (labsBody.instances || [])[0] as LabInstance | undefined;
    setInstance(current || null);
    if (!current || !['provisioning', 'running'].includes(current.status)) {
      setDiagnostics(null);
      return;
    }
    const terminalResponse = await fetch(`/api/labs/instances/${encodeURIComponent(current.id)}/terminal`, { cache: 'no-store' }).catch(() => null);
    if (!terminalResponse) return;
    const terminalBody = await terminalResponse.json().catch(() => ({}));
    setDiagnostics(terminalBody.diagnostics || null);
  }, []);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!instance || !['provisioning', 'running'].includes(instance.status)) return null;
  const ready = diagnostics?.ready === true;
  const ec2Running = diagnostics?.ec2State === 'running' || instance.status === 'running';
  const detail = ready
    ? 'Secure session ready. Terminal access can be opened now; desktop may continue preparing its guest display service for a short time.'
    : ec2Running && diagnostics?.ssmRegistered
      ? 'Instance started. SSM is registered and OXSIG is waiting for the secure session to become online.'
      : ec2Running
        ? 'Instance started. OXSIG is initializing SSM and the secure access path.'
        : 'Cloud instance is starting. OXSIG will keep checking automatically.';

  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl border bg-card/70 px-3 py-2.5 text-xs">
      {ready ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{instance.name}</span><Badge variant={ready ? 'default' : 'outline'}>{ready ? 'Access ready' : 'Initializing'}</Badge></div>
        <p className="mt-1 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
