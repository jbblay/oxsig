'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, Monitor, Presentation, ShieldCheck, TerminalSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';
import { ControlLeasePanel, type LiveWorkspaceControlState } from './ControlLeasePanel';
import type { LiveWorkspaceResourceView } from './LiveWorkspaceResourceCard';

type Stage = { surface: 'board' | 'machine'; bindingId: string } | null;

export default function LiveWorkspaceStage({
  workspaceId, viewerId, role, capabilities, resources, stage, control, onRefresh,
}: {
  workspaceId: string;
  viewerId: string;
  role: 'owner' | 'instructor' | 'learner' | 'observer';
  capabilities: {
    observe: boolean;
    requestControl: boolean;
    grantControl: boolean;
    eligibleForTerminalControl: boolean;
    eligibleForDesktopControl: boolean;
  };
  resources: LiveWorkspaceResourceView[];
  stage: Stage;
  control: LiveWorkspaceControlState;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const canPresent = role === 'owner' || role === 'instructor';
  const boards = resources.filter((r) => r.type === 'storyboard');
  const machines = resources.filter((r) => r.type === 'lab-instance');
  const current = resources.find((r) => r.id === stage?.bindingId) || null;
  const surface = stage?.surface || (boards.length ? 'board' : machines.length ? 'machine' : null);
  const candidate = surface === 'board' ? boards : machines;
  const presented = current && (surface === 'board' ? current.type === 'storyboard' : current.type === 'lab-instance')
    ? current : candidate[0] || null;

  async function present(nextSurface: 'board' | 'machine', bindingId: string) {
    if (!canPresent || busy || (stage?.surface === nextSurface && stage.bindingId === bindingId)) return;
    setBusy(true);
    try {
      const token = await getCsrfToken();
      const response = await fetch(`/api/live-workspaces/${workspaceId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ surface: nextSurface, bindingId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Could not switch presentation');
      }
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not switch presentation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Presentation className="h-4 w-4" /> Main stage</CardTitle>
            <CardDescription className="mt-1 text-xs">Everyone follows the host's active Board or Machine.</CardDescription>
          </div>
          <Badge variant="outline">{canPresent ? 'Host controls' : 'Following host'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Presentation surfaces">
          <Button size="sm" variant={surface === 'board' ? 'secondary' : 'outline'} disabled={!canPresent || boards.length === 0 || busy} onClick={() => void present('board', boards[0].id)}><Presentation className="h-4 w-4" /> Board</Button>
          <Button size="sm" variant={surface === 'machine' ? 'secondary' : 'outline'} disabled={!canPresent || machines.length === 0 || busy} onClick={() => void present('machine', machines[0].id)}><Monitor className="h-4 w-4" /> Machine</Button>
          <Button size="sm" variant="outline" disabled title="Live screen sharing needs a consent-based media connection">Screen (coming later)</Button>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>

        {canPresent && candidate.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="shrink-0 text-xs" htmlFor="live-stage-resource">Present</label>
            <select id="live-stage-resource" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" value={presented?.id || ''} disabled={busy} onChange={(event) => { if (surface) void present(surface, event.target.value); }}>
              {candidate.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        )}

        {!presented && (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/10 p-6 text-center">
            <Presentation className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Your stage is ready</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">Attach a Board or Cyber Lab in Resources to prepare a presentation.</p>
          </div>
        )}

        {presented?.type === 'storyboard' && (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border bg-muted/10 p-6 text-center">
            <Presentation className="h-9 w-9 text-muted-foreground" />
            <div><h3 className="text-base font-semibold">{presented.label}</h3><p className="mt-1 text-xs text-muted-foreground">The attached Board is the current presentation.</p></div>
            <Button asChild size="sm"><Link href={`/collab/storyboards?session=${encodeURIComponent(presented.resourceId)}`} target="_blank" rel="noopener noreferrer">Open Board <ExternalLink className="h-3.5 w-3.5" /></Link></Button>
            <p className="max-w-sm text-xs text-muted-foreground">Board drawing and its existing live video/voice broadcast currently open in the Board editor. Live Workspace does not yet embed that media.</p>
          </div>
        )}

        {presented?.type === 'lab-instance' && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-muted/10 p-4">
              <div className="flex items-center gap-2"><TerminalSquare className="h-5 w-5" /><span className="font-semibold">{presented.label}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">The attached lab remains owned by its original owner. No machine input is granted by viewing it.</p>
              <Button asChild size="sm" variant="outline" className="mt-3"><Link href="/labs" target="_blank" rel="noopener noreferrer">Open my labs <ExternalLink className="h-3.5 w-3.5" /></Link></Button>
            </div>
            <ControlLeasePanel compact workspaceId={workspaceId} viewerId={viewerId} capabilities={capabilities} resources={[presented]} control={control} onRefresh={onRefresh} />
          </div>
        )}

        {presented && <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" /> Presenting never grants Board editing, microphone access, or machine control. Those still require their own authorization.</p>}
      </CardContent>
    </Card>
  );
}
