'use client';

import * as React from 'react';
import { History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AdminAuditEvent } from '@/lib/admin/contract';
import type { AdminNavigation } from './AdminConsole';
import {
  actionLabel,
  actionTone,
  EmptyState,
  ErrorState,
  formatDateTime,
  LoadingRows,
  Panel,
  Pill,
  RefreshButton,
  Segmented,
  timeAgo,
} from './admin-ui';

const SCOPES = [
  { value: '', label: 'Everything' },
  { value: 'admin.', label: 'Admin actions' },
  { value: 'account.', label: 'Accounts' },
  { value: 'lab.', label: 'Labs' },
  { value: 'deployment.', label: 'Deployments' },
  { value: 'storyboard.', label: 'Boards' },
];

type AuditPage = { events: AdminAuditEvent[]; nextCursor: string | null };

export default function AdminActivity({ navigation }: { navigation: AdminNavigation }) {
  const [scope, setScope] = React.useState('');
  const [events, setEvents] = React.useState<AdminAuditEvent[] | null>(null);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestRef = React.useRef(0);

  const load = React.useCallback(async (before: string | null) => {
    const id = ++requestRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (scope) params.set('action', scope);
      if (before) params.set('before', before);
      const response = await fetch(`/api/admin/audit?${params}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      if (id !== requestRef.current) return;
      const page = body as AuditPage;
      setEvents((current) => (before && current ? [...current, ...page.events] : page.events));
      setCursor(page.nextCursor);
      setError(null);
    } catch (cause) {
      if (id === requestRef.current) setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  }, [scope]);

  React.useEffect(() => {
    setEvents(null);
    void load(null);
  }, [load]);

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Segmented label="Activity scope" value={scope} onChange={setScope} options={SCOPES} />
        <span className="ml-auto" />
        <RefreshButton loading={loading} onClick={() => void load(null)} />
      </div>

      {error && !events ? (
        <ErrorState message={error} onRetry={() => void load(null)} />
      ) : !events ? (
        <LoadingRows rows={8} />
      ) : events.length === 0 ? (
        <EmptyState icon={History} title="No activity recorded" description="Audited actions appear here as they happen." />
      ) : (
        <>
          <ul className="divide-y">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:flex-nowrap">
                <Pill tone={actionTone(event.action)} className="w-24 justify-center">{event.action.split('.')[0]}</Pill>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {event.actorId ? (
                      <button type="button" onClick={() => navigation.openUser(event.actorId!)} className="font-medium hover:underline">
                        {event.actorName || event.actorEmail || event.actorId.slice(0, 8)}
                      </button>
                    ) : (
                      <span className="font-medium text-muted-foreground">System</span>
                    )}{' '}
                    <span className="text-muted-foreground">{actionLabel(event.action).toLowerCase()}</span>
                    {event.resourceType === 'user' && event.resourceId && event.resourceId !== event.actorId ? (
                      <>
                        {' · '}
                        <button type="button" onClick={() => navigation.openUser(event.resourceId!)} className="text-xs text-primary hover:underline">view target</button>
                      </>
                    ) : null}
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {event.action}{event.resourceType ? ` · ${event.resourceType}` : ''}{event.ipAddress ? ` · ${event.ipAddress}` : ''}
                    {typeof event.metadata?.reason === 'string' ? ` · “${event.metadata.reason}”` : ''}
                  </div>
                </div>
                <time dateTime={event.createdAt} title={formatDateTime(event.createdAt)} className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(event.createdAt)}</time>
              </li>
            ))}
          </ul>
          {cursor ? (
            <div className="border-t p-3 text-center">
              <Button size="sm" variant="outline" disabled={loading} onClick={() => void load(cursor)}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Load older
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
