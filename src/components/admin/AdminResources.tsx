'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Crosshair, Loader2, Power, Server } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { AdminResource, AdminResourceFilter } from '@/lib/admin/contract';
import type { AdminNavigation } from './AdminConsole';
import {
  adminMutate,
  EmptyState,
  ErrorState,
  LoadingRows,
  Panel,
  Pill,
  RefreshButton,
  Segmented,
  statusTone,
  timeAgo,
  useAdminResource,
} from './admin-ui';

const FILTERS: Array<{ value: AdminResourceFilter; label: string }> = [
  { value: 'live', label: 'Live' },
  { value: 'expired', label: 'Expired' },
  { value: 'failed', label: 'Failed' },
  { value: 'all', label: 'All recent' },
];

function isFilter(value: string | null): value is AdminResourceFilter {
  return FILTERS.some((filter) => filter.value === value);
}

function expiryLabel(resource: AdminResource) {
  if (!resource.expiresAt) return '—';
  const expired = new Date(resource.expiresAt).getTime() <= Date.now();
  const live = !['destroyed', 'failed'].includes(resource.status);
  return (
    <span className={expired && live ? 'font-medium text-amber-600 dark:text-amber-400' : undefined}>
      {expired ? 'Expired ' : 'Expires '}{timeAgo(resource.expiresAt)}
    </span>
  );
}

export default function AdminResources({ navigation }: { navigation: AdminNavigation }) {
  const searchParams = useSearchParams();
  const initial = searchParams.get('filter');
  const [filter, setFilter] = React.useState<AdminResourceFilter>(isFilter(initial) ? initial : 'live');
  const { data, error, loading, reload } = useAdminResource<{ resources: AdminResource[] }>(`/api/admin/resources?filter=${filter}`);
  const [pending, setPending] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (filter !== 'live') return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void reload(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [filter, reload]);

  async function destroy(resource: AdminResource) {
    const owner = resource.ownerName || resource.ownerEmail || 'this user';
    if (!window.confirm(`Force-destroy “${resource.name}” owned by ${owner}? Running machines are terminated immediately.`)) return;
    setPending(resource.id);
    try {
      await adminMutate('/api/admin/resources', 'POST', { kind: resource.kind, id: resource.id });
      toast.success('Teardown started');
      await reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Destroy failed');
    } finally {
      setPending(null);
    }
  }

  const resources = data?.resources ?? [];

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Segmented label="Resource filter" value={filter} onChange={setFilter} options={FILTERS} />
        <span className="ml-auto text-xs text-muted-foreground">{filter === 'live' ? 'Auto-refreshes every 30s' : null}</span>
        <RefreshButton loading={loading} onClick={() => void reload()} />
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : !data ? (
        <LoadingRows rows={6} />
      ) : resources.length === 0 ? (
        <EmptyState
          icon={Server}
          title={filter === 'live' ? 'Nothing is running' : filter === 'expired' ? 'No expired resources left behind' : 'No resources here'}
          description={filter === 'live' ? 'Labs and operations launched by users show up here in real time.' : 'Lifecycle cleanup is keeping up.'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Resource</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Expiry</th>
                <th className="px-4 py-2 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className={loading ? 'opacity-60 transition-opacity' : undefined}>
              {resources.map((resource) => {
                const Icon = resource.kind === 'lab' ? Box : Crosshair;
                const live = !['destroyed', 'failed', 'destroying'].includes(resource.status);
                return (
                  <tr key={`${resource.kind}-${resource.id}`} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border bg-muted/40"><Icon className="h-4 w-4 text-muted-foreground" /></span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{resource.name}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {resource.kind === 'lab' ? 'Lab' : 'Operation'}{resource.provider ? ` · ${resource.provider}` : ''}{resource.partOfOperation ? ' · part of an operation' : ''}
                          </div>
                          {resource.lastError ? <div className="max-w-xs truncate text-[11px] text-rose-600 dark:text-rose-400" title={resource.lastError}>{resource.lastError}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><Pill tone={statusTone(resource.status)} dot>{resource.status}</Pill></td>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => navigation.openUser(resource.ownerId)} className="max-w-[200px] truncate text-left text-xs hover:underline">
                        {resource.ownerName || resource.ownerEmail || resource.ownerId.slice(0, 8)}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{timeAgo(resource.startedAt || resource.createdAt)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{expiryLabel(resource)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {live ? (
                        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-rose-600 hover:text-rose-600 dark:text-rose-400" disabled={pending !== null} onClick={() => void destroy(resource)}>
                          {pending === resource.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />} Destroy
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
