'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Boxes,
  Loader2,
  MailX,
  Network,
  Pencil,
  RadioTower,
  RefreshCcw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCsrfToken } from '@/lib/security/csrf-client';

type CollaborationItem = {
  id: string;
  name: string;
  description: string;
  collaborationType: string;
  memberCount: number;
  isOwner: boolean;
  updatedAt: string;
};

type WorkspaceItem = {
  id: string;
  name: string;
  description: string;
  isOwner: boolean;
  role: string;
  status: 'active' | 'ended';
  updatedAt: string;
};

type PendingInvitation = {
  id: string;
  collaborationId: string;
  collaborationName: string;
  email: string;
  deliveryStatus: string;
  expiresAt: string;
};

type DashboardState = {
  collaborations: CollaborationItem[];
  workspaces: WorkspaceItem[];
  invitations: PendingInvitation[];
  hasInfrastructureDesign: boolean;
};

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return body?.error || fallback;
}

export default function ManageResourcesPage() {
  const [state, setState] = React.useState<DashboardState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [collaborationResponse, workspaceResponse, invitationResponse, designResponse] = await Promise.all([
        fetch('/api/collaborations', { cache: 'no-store' }),
        fetch('/api/live-workspaces?includeEnded=owned', { cache: 'no-store' }),
        fetch('/api/collaborations/invitations', { cache: 'no-store' }),
        fetch('/api/labs/infrastructure-design', { cache: 'no-store' }),
      ]);

      if (!collaborationResponse.ok) throw new Error(await responseError(collaborationResponse, 'Could not load collaborations'));
      if (!workspaceResponse.ok) throw new Error(await responseError(workspaceResponse, 'Could not load Live Workspaces'));
      if (!invitationResponse.ok) throw new Error(await responseError(invitationResponse, 'Could not load invitations'));
      if (!designResponse.ok) throw new Error(await responseError(designResponse, 'Could not load infrastructure design'));

      const collaborations = await collaborationResponse.json() as { collaborations: CollaborationItem[] };
      const workspaces = await workspaceResponse.json() as { workspaces: WorkspaceItem[] };
      const invitations = await invitationResponse.json() as { invitations: PendingInvitation[] };
      const design = await designResponse.json() as { design: unknown | null };

      setState({
        collaborations: (collaborations.collaborations || []).filter((item) => item.isOwner && item.collaborationType !== 'live-workspace'),
        workspaces: (workspaces.workspaces || []).filter((item) => item.isOwner),
        invitations: invitations.invitations || [],
        hasInfrastructureDesign: Boolean(design.design),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Resources could not be loaded');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function mutate(key: string, url: string, method: 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(key);
    try {
      const token = await getCsrfToken();
      const response = await fetch(url, {
        method,
        headers: {
          'x-csrf-token': token,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw new Error(await responseError(response, 'The resource could not be changed'));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The resource could not be changed');
    } finally {
      setBusy(null);
    }
  }

  async function renameCollaboration(item: CollaborationItem) {
    const name = window.prompt('Collaboration name', item.name)?.trim();
    if (!name || name === item.name) return;
    await mutate(`collaboration:${item.id}`, `/api/collaborations/${item.id}`, 'PATCH', { name });
  }

  async function deleteCollaboration(item: CollaborationItem) {
    if (!window.confirm(`Permanently delete “${item.name}” and its collaboration history?`)) return;
    await mutate(`collaboration:${item.id}`, `/api/collaborations/${item.id}`, 'DELETE');
  }

  async function revokeInvitation(invitation: PendingInvitation) {
    if (!window.confirm(`Revoke the invitation for ${invitation.email} to “${invitation.collaborationName}”?`)) return;
    await mutate(`invitation:${invitation.id}`, `/api/collaborations/invitations?invitationId=${encodeURIComponent(invitation.id)}`, 'DELETE');
  }

  async function endWorkspace(item: WorkspaceItem) {
    if (!window.confirm(`End “${item.name}”? Active control requests and leases will be cancelled or revoked.`)) return;
    await mutate(`workspace:${item.id}`, `/api/live-workspaces/${item.id}`, 'PATCH', { action: 'end' });
  }

  async function deleteWorkspace(item: WorkspaceItem) {
    if (!window.confirm(`Permanently delete Live Workspace “${item.name}”? Attached resources themselves will not be deleted.`)) return;
    await mutate(`workspace:${item.id}`, `/api/live-workspaces/${item.id}`, 'DELETE');
  }

  async function deleteInfrastructureDesign() {
    if (!window.confirm('Permanently reset your saved infrastructure design?')) return;
    await mutate('infrastructure-design', '/api/labs/infrastructure-design', 'DELETE');
  }

  if (loading && !state) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading resources…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Resources</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage what you own.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading || Boolean(busy)}>
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Resource shortcuts">
        <Link href="/collab" className="group">
          <Card className="h-full transition hover:border-primary/30 hover:shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted group-hover:bg-primary/10 group-hover:text-primary"><Boxes className="h-5 w-5" /></span>
              <div><p className="font-semibold">Collaboration</p><p className="text-xs text-muted-foreground">Open sessions</p></div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/live" className="group">
          <Card className="h-full transition hover:border-primary/30 hover:shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted group-hover:bg-primary/10 group-hover:text-primary"><RadioTower className="h-5 w-5" /></span>
              <div><p className="font-semibold">Live Workspace</p><p className="text-xs text-muted-foreground">Open workspaces</p></div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/labs" className="group sm:col-span-2 lg:col-span-1">
          <Card className="h-full transition hover:border-primary/30 hover:shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted group-hover:bg-primary/10 group-hover:text-primary"><Network className="h-5 w-5" /></span>
              <div><p className="font-semibold">Infrastructure</p><p className="text-xs text-muted-foreground">Open Cyber Lab</p></div>
            </CardContent>
          </Card>
        </Link>
      </section>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Collaboration sessions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!state?.collaborations.length && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No owned collaboration sessions.</p>}
          {state?.collaborations.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="truncate font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.memberCount} member{item.memberCount === 1 ? '' : 's'}</p></div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy === `collaboration:${item.id}`} onClick={() => void renameCollaboration(item)}><Pencil className="h-4 w-4" /> Rename</Button>
                <Button size="sm" variant="destructive" disabled={busy === `collaboration:${item.id}`} onClick={() => void deleteCollaboration(item)}><Trash2 className="h-4 w-4" /> Delete</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Live Workspaces</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!state?.workspaces.length && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No owned Live Workspaces.</p>}
          {state?.workspaces.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{item.name}</p><Badge variant={item.status === 'active' ? 'default' : 'outline'} className="capitalize">{item.status}</Badge></div>
                {item.description && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {item.status === 'active' && <Button size="sm" variant="outline" disabled={busy === `workspace:${item.id}`} onClick={() => void endWorkspace(item)}>End</Button>}
                <Button size="sm" variant="destructive" disabled={busy === `workspace:${item.id}`} onClick={() => void deleteWorkspace(item)}><Trash2 className="h-4 w-4" /> Delete</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><MailX className="h-4 w-4" /> Pending invitations</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!state?.invitations.length && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No pending invitations.</p>}
          {state?.invitations.map((invitation) => (
            <div key={invitation.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="truncate font-semibold">{invitation.email}</p><p className="truncate text-xs text-muted-foreground">{invitation.collaborationName} · {invitation.deliveryStatus}</p></div>
              <Button size="sm" variant="outline" disabled={busy === `invitation:${invitation.id}`} onClick={() => void revokeInvitation(invitation)}>Revoke</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Infrastructure design</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">{state?.hasInfrastructureDesign ? 'Saved design' : 'No saved design'}</p><p className="text-xs text-muted-foreground">{state?.hasInfrastructureDesign ? 'Your current blueprint is persisted.' : 'Build one from Cyber Lab.'}</p></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild><Link href="/labs">Open</Link></Button>
            {state?.hasInfrastructureDesign && <Button size="sm" variant="destructive" disabled={busy === 'infrastructure-design'} onClick={() => void deleteInfrastructureDesign()}><Trash2 className="h-4 w-4" /> Reset</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
