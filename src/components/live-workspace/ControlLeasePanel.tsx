'use client';

import * as React from 'react';
import { Clock3, Loader2, Monitor, ShieldCheck, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import { SharedWorkspaceTerminal } from '@/components/live-workspace/SharedWorkspaceTerminal';
import { SharedWorkspaceTerminalObserver } from '@/components/live-workspace/SharedWorkspaceTerminalObserver';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';

type Surface = 'terminal' | 'desktop';
type WorkspaceResourceType = 'lab-instance' | 'academy-course' | 'infrastructure-design' | 'storyboard' | 'vault-item';

type Capabilities = {
  observe: boolean;
  requestControl: boolean;
  grantControl: boolean;
  eligibleForTerminalControl: boolean;
  eligibleForDesktopControl: boolean;
};

type WorkspaceResource = {
  id: string;
  type: WorkspaceResourceType;
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
  compact?: boolean;
  workspaceId: string;
  viewerId: string;
  capabilities: Capabilities;
  resources: WorkspaceResource[];
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

function surfaceLabel(surface: Surface) {
  return surface === 'terminal' ? 'Terminal' : 'Desktop';
}

export function ControlLeasePanel({ workspaceId, viewerId, capabilities, resources, control, onRefresh, compact = false }: Props) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [durationMinutes, setDurationMinutes] = React.useState(15);

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

  const labs = resources.filter((resource): resource is WorkspaceResource & { type: 'lab-instance'; accessMode: Surface } =>
    resource.type === 'lab-instance' && (resource.accessMode === 'terminal' || resource.accessMode === 'desktop')
  );
  const pending = control.requests.filter((request) => request.status === 'pending');

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Machine control</CardTitle>
            {!compact && <CardDescription>Only attached Cyber Labs participate in machine control. Terminal output can be observed by workspace participants; input always remains lease-gated.</CardDescription>}
          </div>
          <Badge variant="outline">Explicit control</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {labs.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Attach a Cyber Lab to make terminal or desktop control available.</p>}

        {labs.map((resource) => {
          const lease = control.leases.find((item) => item.bindingId === resource.id && item.surface === resource.accessMode && item.status === 'active' && new Date(item.expiresAt).getTime() > now);
          const ownPending = pending.find((item) => item.participantId === viewerId && item.bindingId === resource.id && item.surface === resource.accessMode);
          const eligible = resource.accessMode === 'terminal'
            ? capabilities.eligibleForTerminalControl
            : capabilities.eligibleForDesktopControl;
          const canRequest = capabilities.requestControl && eligible && !lease && !ownPending;
          const canRevoke = Boolean(lease && (capabilities.grantControl || lease.participantId === viewerId));
          const ownsLease = Boolean(lease && lease.participantId === viewerId);
          const ownsTerminalLease = Boolean(ownsLease && lease?.surface === 'terminal');
          const observesTerminalLease = Boolean(capabilities.observe && lease && !ownsLease && lease.surface === 'terminal');

          return (
            <div key={resource.id} className="rounded-xl border p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold"><SurfaceIcon surface={resource.accessMode} /> {resource.label}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{surfaceLabel(resource.accessMode)} control</p>
                </div>
                {lease ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Badge>{ownsLease ? 'You have control' : observesTerminalLease ? 'Watching live' : 'Control active'}</Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" /> {remaining(lease.expiresAt, now)} remaining</span>
                    {canRevoke && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `revoke:${lease.id}`}
                        onClick={() => void mutate(
                          `revoke:${lease.id}`,
                          `/api/live-workspaces/${workspaceId}/control-leases/${lease.id}/revoke`,
                          undefined,
                          ownsLease ? 'Control released.' : 'Control revoked.'
                        )}
                      >
                        {busy === `revoke:${lease.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : ownsLease ? 'Release control' : 'Revoke control'}
                      </Button>
                    )}
                  </div>
                ) : ownPending ? (
                  <Badge variant="secondary">Request pending</Badge>
                ) : canRequest ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === `request:${resource.id}`}
                    onClick={() => void mutate(
                      `request:${resource.id}`,
                      `/api/live-workspaces/${workspaceId}/control-requests`,
                      { bindingId: resource.id, surface: resource.accessMode },
                      `${surfaceLabel(resource.accessMode)} control requested.`
                    )}
                  >
                    {busy === `request:${resource.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Request control'}
                  </Button>
                ) : (
                  <Badge variant="outline">Observe only</Badge>
                )}
              </div>
              {lease && (
                <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Controller: {lease.participantName}.</span>{' '}
                  {lease.surface === 'terminal'
                    ? ownsLease
                      ? 'Open the terminal below when you are ready. Authorized teammates receive output only.'
                      : 'The terminal below mirrors the controller output. Your view cannot send input.'
                    : 'Desktop control is authorized, but shared desktop transport is not connected yet.'}
                </div>
              )}
              {ownsTerminalLease && lease && (
                <SharedWorkspaceTerminal
                  workspaceId={workspaceId}
                  bindingId={resource.id}
                  labInstanceId={resource.resourceId}
                  machineLabel={resource.label}
                  leaseId={lease.id}
                  leaseExpiresAt={lease.expiresAt}
                  onAuthorizationChanged={onRefresh}
                />
              )}
              {observesTerminalLease && lease && (
                <SharedWorkspaceTerminalObserver
                  workspaceId={workspaceId}
                  bindingId={resource.id}
                  machineLabel={resource.label}
                  controllerName={lease.participantName}
                  leaseId={lease.id}
                  leaseExpiresAt={lease.expiresAt}
                  onAuthorizationChanged={onRefresh}
                />
              )}
            </div>
          );
        })}

        {capabilities.grantControl && pending.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-sm font-semibold">Control requests</p><p className="text-xs text-muted-foreground">Approve only the participant who should actively operate the machine.</p></div>
              <div className="space-y-1">
                <label htmlFor="control-duration" className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Grant for</label>
                <select id="control-duration" className="block h-9 rounded-md border bg-background px-2 text-xs" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>
                  <option value={5}>5 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>
            </div>
            {pending.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className="text-sm font-semibold">{request.participantName}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><SurfaceIcon surface={request.surface} /> {request.labLabel} · {surfaceLabel(request.surface)}</p>
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
                    title={request.participantId === viewerId ? 'You cannot approve your own control request' : undefined}
                    onClick={() => void mutate(
                      `approve:${request.id}`,
                      `/api/live-workspaces/${workspaceId}/control-requests/${request.id}/approve`,
                      { durationMinutes },
                      `Control granted for ${durationMinutes} minutes.`
                    )}
                  >
                    {busy === `approve:${request.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : `Grant ${durationMinutes} min`}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!compact && <p className="text-[11px] leading-5 text-muted-foreground">{control.note}</p>}
      </CardContent>
    </Card>
  );
}

