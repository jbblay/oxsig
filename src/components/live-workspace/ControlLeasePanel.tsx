'use client';

import * as React from 'react';
import { Clock3, Loader2, Monitor, ShieldCheck, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Surface = 'terminal' | 'desktop';

type Capabilities = {
  requestControl: boolean;
  grantControl: boolean;
  eligibleForTerminalControl: boolean;
  eligibleForDesktopControl: boolean;
};

type LabResource = {
  id: string;
  type: 'lab-instance' | 'academy-course' | 'infrastructure-design';
  resourceId: string;
  label: string;
  accessMode: Surface | null;
};

type ControlRequest = {
  id: string;
  participantId: string;
  participantName: string;
  bindingId: string;
  labInstanceId: string;
  labLabel: string;
  surface: Surface;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  requestedAt: string;
};

type ControlLease = {
  id: string;
  requestId: string;
  participantId: string;
  participantName: string;
  bindingId: string;
  labInstanceId: string;
  labLabel: string;
  surface: Surface;
  grantedBy: string;
  status: 'active' | 'revoked' | 'expired';
  grantedAt: string;
  expiresAt: string;
};

export type LiveWorkspaceControlState = {
  requests: ControlRequest[];
  leases: ControlLease[];
  note: string;
};

type Props = {
  workspaceId: string;
  viewerId: string;
  capabilities: Capabilities;
  resources: LabResource[];
  control: LiveWorkspaceControlState;
  onRefresh: () => Promise<void>;
};

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

function remaining(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function SurfaceIcon({ surface }: { surface: Surface }) {
  return surface === 'terminal' ? <Terminal className="h-4 w-4" /> : <Monitor className="h-4 w-4" />;
}

export function ControlLeasePanel({ workspaceId, viewerId, capabilities, resources, control, onRefresh }: Props) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function mutate(key: string, path: string, body?: unknown, success?: string) {
    setBusy(key);
    try {
      const token = await getCsrfToken();
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await apiError(response, 'Control authorization update failed'));
      await onRefresh();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Control authorization update failed');
    } finally {
      setBusy(null);
    }
  }

  const labs = resources.filter((resource): resource is LabResource & { accessMode: Surface } =>
    resource.type === 'lab-instance' && (resource.accessMode === 'terminal' || resource.accessMode === 'desktop')
  );
  const pending = control.requests.filter((request) => request.status === 'pending');

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Control leases</CardTitle>
            <CardDescription>Request, grant and revoke time-bounded authorization. Membership alone never grants machine input.</CardDescription>
          </div>
          <Badge variant="outline">authorization only · transport disconnected</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {labs.length === 0 && <p className="text-xs text-muted-foreground">Attach a Cyber Lab before requesting terminal or desktop control.</p>}

        {labs.map((resource) => {
          const lease = control.leases.find((item) => item.bindingId === resource.id && item.surface === resource.accessMode);
          const ownPending = pending.find((item) => item.participantId === viewerId && item.bindingId === resource.id && item.surface === resource.accessMode);
          const eligible = resource.accessMode === 'terminal'
            ? capabilities.eligibleForTerminalControl
            : capabilities.eligibleForDesktopControl;
          const canRequest = capabilities.requestControl && eligible && !lease && !ownPending;
          const canRevoke = Boolean(lease && (capabilities.grantControl || lease.participantId === viewerId));

          return (
            <div key={resource.id} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold"><SurfaceIcon surface={resource.accessMode} /> {resource.label}</div>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{resource.accessMode} · {resource.resourceId}</p>
                </div>
                {lease ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>lease active</Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" /> {remaining(lease.expiresAt, now)}</span>
                    {canRevoke && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `revoke:${lease.id}`}
                        onClick={() => void mutate(
                          `revoke:${lease.id}`,
                          `/api/live-workspaces/${workspaceId}/control-leases/${lease.id}/revoke`,
                          undefined,
                          lease.participantId === viewerId ? 'Control lease released.' : 'Control lease revoked.'
                        )}
                      >
                        {busy === `revoke:${lease.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Revoke'}
                      </Button>
                    )}
                  </div>
                ) : ownPending ? (
                  <Badge variant="secondary">request pending</Badge>
                ) : canRequest ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === `request:${resource.id}`}
                    onClick={() => void mutate(
                      `request:${resource.id}`,
                      `/api/live-workspaces/${workspaceId}/control-requests`,
                      { bindingId: resource.id, surface: resource.accessMode },
                      `${resource.accessMode === 'terminal' ? 'Terminal' : 'Desktop'} control requested.`
                    )}
                  >
                    {busy === `request:${resource.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Request control'}
                  </Button>
                ) : (
                  <Badge variant="outline">observe only</Badge>
                )}
              </div>
              {lease && <p className="mt-2 text-xs text-muted-foreground">Controller: {lease.participantName}. The lease is authoritative authorization; this PR does not forward terminal, keyboard, or mouse input.</p>}
            </div>
          );
        })}

        {capabilities.grantControl && pending.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending approval</p>
            {pending.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className="text-sm font-semibold">{request.participantName} → {request.labLabel}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><SurfaceIcon surface={request.surface} /> {request.surface} control</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === `deny:${request.id}`}
                    onClick={() => void mutate(`deny:${request.id}`, `/api/live-workspaces/${workspaceId}/control-requests/${request.id}/deny`, undefined, 'Control request denied.')}
                  >Deny</Button>
                  <Button
                    size="sm"
                    disabled={busy === `approve:${request.id}` || request.participantId === viewerId}
                    title={request.participantId === viewerId ? 'Self-approval is not allowed' : undefined}
                    onClick={() => void mutate(
                      `approve:${request.id}`,
                      `/api/live-workspaces/${workspaceId}/control-requests/${request.id}/approve`,
                      { durationMinutes: 15 },
                      'Control granted for 15 minutes.'
                    )}
                  >
                    {busy === `approve:${request.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Grant 15 min'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] leading-5 text-muted-foreground">{control.note}</p>
      </CardContent>
    </Card>
  );
}
