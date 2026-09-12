'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getLabsSnapshot, type ClientLabInstance } from '@/lib/labs/client';

type Diagnostics = { ec2State?: string; ssmRegistered?: boolean; ssmPingStatus?: string | null; ready?: boolean };

const TRANSITIONAL = new Set(['created', 'provisioning', 'stopping', 'destroying', 'resetting']);

function observationLabel(observedAt?: string | null) {
  if (!observedAt) return 'never provider-confirmed';
  const value = new Date(observedAt);
  if (!Number.isFinite(value.getTime())) return 'provider observation time unknown';
  return `provider confirmed ${value.toLocaleString()}`;
}

export default function LabAccessReadinessBanner() {
  const [instance, setInstance] = React.useState<ClientLabInstance | null>(null);
  const [diagnostics, setDiagnostics] = React.useState<Diagnostics | null>(null);
  const [refreshingStatus, setRefreshingStatus] = React.useState(false);

  const refresh = React.useCallback(async (reconcile = false) => {
    if (reconcile) setRefreshingStatus(true);
    try {
      let snapshot = await getLabsSnapshot({ force: reconcile });
      if (!snapshot.ok) return;
      let current = snapshot.data.instances?.[0] || null;
      setInstance(current);

      // Transitional lifecycle state is the one place the existing Lab UI needs
      // automatic provider progress. Ordinary stable reads remain persisted-only.
      if (!reconcile && current && TRANSITIONAL.has(current.status)) {
        snapshot = await getLabsSnapshot({ force: true });
        if (snapshot.ok) {
          current = snapshot.data.instances?.[0] || null;
          setInstance(current);
        }
      }

      if (!current || !['provisioning', 'running'].includes(current.status)) {
        setDiagnostics(null);
        return;
      }

      const terminalResponse = await fetch(
        `/api/labs/instances/${encodeURIComponent(current.id)}/terminal`,
        { cache: 'no-store' }
      ).catch(() => null);
      if (!terminalResponse) return;
      const terminalBody = await terminalResponse.json().catch(() => ({}));
      setDiagnostics(terminalBody.diagnostics || null);
    } finally {
      if (reconcile) setRefreshingStatus(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!instance) return null;

  const checkingAccess = ['provisioning', 'running'].includes(instance.status);
  const ready = diagnostics?.ready === true;
  const ec2Running = diagnostics?.ec2State === 'running' || instance.status === 'running';
  const stale = instance.stale === true;
  const detail = ready
    ? 'Secure session ready. Terminal access can be opened now; desktop may continue preparing its guest display service for a short time.'
    : checkingAccess && ec2Running && diagnostics?.ssmRegistered
      ? 'Instance started. SSM is registered and OXSIG is waiting for the secure session to become online.'
      : checkingAccess && ec2Running
        ? 'Instance started. OXSIG is initializing SSM and the secure access path.'
        : checkingAccess
          ? 'Cloud instance is starting. OXSIG will keep checking automatically.'
          : `Latest persisted lifecycle state: ${instance.status}.`;

  if (!checkingAccess && !stale && !instance.reconciliationWarning) return null;

  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl border bg-card/70 px-3 py-2.5 text-xs">
      {stale
        ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        : ready
          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          : <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{instance.name}</span>
          {checkingAccess && <Badge variant={ready ? 'default' : 'outline'}>{ready ? 'Access ready' : 'Initializing'}</Badge>}
          <Badge variant={stale ? 'secondary' : 'outline'}>{stale ? 'Status stale' : 'Status current'}</Badge>
        </div>
        <p className="mt-1 text-muted-foreground">{detail}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {stale ? 'Showing the last known provider state · ' : ''}
          {observationLabel(instance.observedAt)}
        </p>
        {instance.reconciliationWarning && (
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
            {instance.reconciliationWarning}
          </p>
        )}
      </div>
      {(stale || instance.reconciliationWarning) && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          onClick={() => void refresh(true)}
          disabled={refreshingStatus}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshingStatus ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      )}
    </div>
  );
}
