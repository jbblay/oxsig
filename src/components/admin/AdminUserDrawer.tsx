'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Ban,
  Box,
  Copy,
  Crown,
  Loader2,
  Power,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AdminResource, AdminUserDetail } from '@/lib/admin/contract';
import { EXPERIENCE_LEVELS, FOCUS_AREAS } from '@/lib/account/profile-contract';
import {
  actionLabel,
  actionTone,
  adminMutate,
  Avatar,
  ErrorState,
  formatDateTime,
  formatMinutes,
  LoadingRows,
  Pill,
  statusTone,
  timeAgo,
  useAdminResource,
} from './admin-ui';

type Pending = null | 'suspend' | 'restore' | 'role' | 'terminate' | 'delete' | `destroy:${string}`;

export default function AdminUserDrawer({
  userId,
  currentAdminId,
  onClose,
  onChanged,
}: {
  userId: string | null;
  currentAdminId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, error, loading, reload } = useAdminResource<AdminUserDetail>(userId ? `/api/admin/users/${userId}` : null);
  const [pending, setPending] = React.useState<Pending>(null);
  const [mode, setMode] = React.useState<null | 'suspend' | 'delete'>(null);
  const [reason, setReason] = React.useState('');
  const [terminate, setTerminate] = React.useState(true);
  const [confirmEmail, setConfirmEmail] = React.useState('');

  React.useEffect(() => {
    setMode(null);
    setReason('');
    setConfirmEmail('');
    setTerminate(true);
  }, [userId]);

  const detail = data && data.user.id === userId ? data : null;
  const user = detail?.user;
  const isSelf = Boolean(user && currentAdminId && user.id === currentAdminId);
  const protectedAccount = Boolean(user?.isFounder || isSelf);

  async function run(kind: Pending, request: () => Promise<unknown>, success: string, options: { closeAfter?: boolean } = {}) {
    setPending(kind);
    try {
      await request();
      toast.success(success);
      setMode(null);
      onChanged();
      if (options.closeAfter) onClose();
      else await reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Action failed');
    } finally {
      setPending(null);
    }
  }

  const patch = (body: unknown) => adminMutate(`/api/admin/users/${userId}`, 'PATCH', body);

  async function destroy(resource: AdminResource) {
    await run(`destroy:${resource.id}`, () => adminMutate('/api/admin/resources', 'POST', { kind: resource.kind, id: resource.id }), `${resource.kind === 'lab' ? 'Lab' : 'Operation'} teardown started`);
  }

  return (
    <DialogPrimitive.Root open={Boolean(userId)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l bg-background shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right">
          <DialogPrimitive.Title className="sr-only">User details</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Profile, usage, resources and lifecycle controls for this account</DialogPrimitive.Description>

          <div className="flex items-center justify-between border-b px-5 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Operator record</span>
            <DialogPrimitive.Close asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Close"><X className="h-4 w-4" /></Button>
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {error && !detail ? (
              <ErrorState message={error} onRetry={() => void reload()} />
            ) : !user || !detail ? (
              <LoadingRows rows={6} />
            ) : (
              <div className={loading ? 'opacity-70 transition-opacity' : undefined}>
                <div className="flex items-start gap-4 px-5 py-5">
                  <Avatar name={user.displayName} src={user.avatarUrl} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold tracking-tight">{user.displayName}</h2>
                      {user.isFounder ? <Pill tone="warn"><Crown className="h-3 w-3" />Founder</Pill> : user.role === 'admin' ? <Pill tone="brand">Admin</Pill> : null}
                      <Pill tone={statusTone(user.status)} dot>{user.status}</Pill>
                    </div>
                    {user.headline ? <p className="mt-0.5 text-sm text-muted-foreground">{user.headline}</p> : null}
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {user.email || 'No email'} {user.email ? (user.emailVerified ? '· verified' : '· unverified') : ''}
                    </p>
                    <button
                      type="button"
                      onClick={() => { void navigator.clipboard?.writeText(user.id); toast.success('User id copied'); }}
                      className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {user.id} <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {user.status === 'suspended' && (
                  <div className="mx-5 mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    Suspended {timeAgo(user.suspendedAt)}{user.suspendedReason ? `: ${user.suspendedReason}` : ''}
                  </div>
                )}

                <dl className="mx-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border text-center">
                  {[
                    ['Labs', detail.usage.labs],
                    ['Operations', detail.usage.operations],
                    ['Runtime', formatMinutes(detail.usage.runtimeMinutes)],
                    ['Active days (30d)', detail.usage.activeDays30d],
                    ['Vault items', detail.usage.vaultItems],
                    ['Teams', detail.usage.collaborations],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-card px-2 py-3">
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                      <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>

                <Section title="Lifecycle">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <Meta label="Joined" value={formatDateTime(user.createdAt)} />
                    <Meta label="Last seen" value={user.lastSeenAt ? `${timeAgo(user.lastSeenAt)}` : 'Never'} />
                    <Meta label="Onboarding" value={user.onboardedAt ? `Done ${timeAgo(user.onboardedAt)}` : 'Not finished'} />
                    <Meta label="Sign-in" value={user.authProvider === 'clerk' ? 'Clerk' : user.authProvider || '—'} />
                    <Meta label="Experience" value={EXPERIENCE_LEVELS.find((level) => level.id === user.experienceLevel)?.label || '—'} />
                    <Meta label="Focus" value={user.focusAreas.map((id) => FOCUS_AREAS.find((area) => area.id === id)?.label || id).join(', ') || '—'} />
                  </dl>
                </Section>

                <Section title={`Resources (${detail.resources.length})`}>
                  {detail.resources.length === 0 ? (
                    <p className="text-xs text-muted-foreground">This operator has not launched anything yet.</p>
                  ) : (
                    <ul className="divide-y rounded-lg border">
                      {detail.resources.map((resource) => {
                        const live = !['destroyed', 'failed'].includes(resource.status);
                        return (
                          <li key={`${resource.kind}-${resource.id}`} className="flex items-center gap-3 px-3 py-2">
                            <Box className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium">{resource.name}</div>
                              <div className="truncate text-[11px] text-muted-foreground">{resource.kind} · {timeAgo(resource.createdAt)}{resource.lastError ? ` · ${resource.lastError}` : ''}</div>
                            </div>
                            <Pill tone={statusTone(resource.status)}>{resource.status}</Pill>
                            {live && resource.status !== 'destroying' ? (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" disabled={pending !== null} onClick={() => void destroy(resource)} aria-label={`Destroy ${resource.name}`} title="Force destroy">
                                {pending === `destroy:${resource.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                              </Button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Section>

                <Section title="Controls">
                  {protectedAccount ? (
                    <p className="mb-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      {isSelf ? 'This is your account. Suspension, deletion and self-demotion are disabled.' : 'Founder accounts are protected. Their access comes from OXSIG_FOUNDER_EMAILS.'}
                    </p>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2">
                    {user.status === 'suspended' ? (
                      <Button variant="outline" disabled={pending !== null} onClick={() => void run('restore', () => patch({ action: 'restore' }), 'Access restored')}>
                        {pending === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Restore access
                      </Button>
                    ) : (
                      <Button variant="outline" disabled={pending !== null || protectedAccount} onClick={() => setMode(mode === 'suspend' ? null : 'suspend')}>
                        <Ban className="h-4 w-4" /> Suspend
                      </Button>
                    )}

                    {user.role === 'admin' ? (
                      <Button
                        variant="outline"
                        disabled={pending !== null || protectedAccount}
                        onClick={() => void run('role', () => patch({ action: 'set-role', role: 'user' }), 'Admin access removed')}
                      >
                        {pending === 'role' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />} Remove admin
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={pending !== null || user.status !== 'active'}
                        onClick={() => {
                          if (window.confirm(`Give ${user.displayName} full platform admin access?`)) {
                            void run('role', () => patch({ action: 'set-role', role: 'admin' }), 'Promoted to admin');
                          }
                        }}
                      >
                        {pending === 'role' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Make admin
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      disabled={pending !== null || !detail.resources.some((resource) => !['destroyed', 'failed', 'destroying'].includes(resource.status))}
                      onClick={() => void run('terminate', () => patch({ action: 'terminate-resources' }), 'All live resources are being terminated')}
                    >
                      {pending === 'terminate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Terminate all resources
                    </Button>

                    <Button variant="outline" className="text-rose-600 hover:text-rose-600 dark:text-rose-400" disabled={pending !== null || protectedAccount} onClick={() => setMode(mode === 'delete' ? null : 'delete')}>
                      <Trash2 className="h-4 w-4" /> Delete account
                    </Button>
                  </div>

                  {mode === 'suspend' && (
                    <form
                      className="mt-3 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run('suspend', () => patch({ action: 'suspend', reason: reason.trim(), terminateResources: terminate }), 'Account suspended');
                      }}
                    >
                      <label htmlFor="suspend-reason" className="text-xs font-medium">Reason (shown in the audit trail)</label>
                      <Textarea id="suspend-reason" rows={2} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Abuse of lab resources" />
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={terminate} onChange={(event) => setTerminate(event.target.checked)} className="h-3.5 w-3.5 accent-current" />
                        Also terminate their live labs and operations
                      </label>
                      <Button type="submit" size="sm" disabled={reason.trim().length < 3 || pending !== null}>
                        {pending === 'suspend' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Suspend account
                      </Button>
                    </form>
                  )}

                  {mode === 'delete' && (
                    <form
                      className="mt-3 space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run('delete', () => adminMutate(`/api/admin/users/${userId}`, 'DELETE', { confirmEmail: confirmEmail.trim() }), 'Account permanently deleted', { closeAfter: true });
                      }}
                    >
                      <p className="text-xs text-rose-700 dark:text-rose-300">
                        This permanently removes their cloud resources, files and data, then deletes their sign-in. It cannot be undone.
                      </p>
                      <label htmlFor="delete-confirm" className="text-xs font-medium">Type <span className="font-mono">{user.email}</span> to confirm</label>
                      <Input id="delete-confirm" value={confirmEmail} onChange={(event) => setConfirmEmail(event.target.value)} autoComplete="off" />
                      <Button type="submit" size="sm" variant="destructive" disabled={!user.email || confirmEmail.trim().toLowerCase() !== user.email.toLowerCase() || pending !== null}>
                        {pending === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete permanently
                      </Button>
                    </form>
                  )}
                </Section>

                <Section title="Activity">
                  {detail.events.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No audited activity.</p>
                  ) : (
                    <ol className="relative space-y-3 border-l pl-4">
                      {detail.events.map((event) => (
                        <li key={event.id} className="relative">
                          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary/60" aria-hidden="true" />
                          <div className="flex items-center gap-2">
                            <Pill tone={actionTone(event.action)}>{event.action.split('.')[0]}</Pill>
                            <span className="text-xs">{actionLabel(event.action)}</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{formatDateTime(event.createdAt)}{event.ipAddress ? ` · ${event.ipAddress}` : ''}</div>
                        </li>
                      ))}
                    </ol>
                  )}
                </Section>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t px-5 py-4 first-of-type:border-t-0">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
