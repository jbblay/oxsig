'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Crown, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdminUserFilter, AdminUserList, AdminUserSort } from '@/lib/admin/contract';
import type { AdminNavigation } from './AdminConsole';
import {
  Avatar,
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

const FILTERS: Array<{ value: AdminUserFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'new', label: 'New (7d)' },
  { value: 'dormant', label: 'Dormant' },
  { value: 'admins', label: 'Admins' },
  { value: 'suspended', label: 'Suspended' },
];

const PAGE_SIZE = 25;

function isFilter(value: string | null): value is AdminUserFilter {
  return FILTERS.some((filter) => filter.value === value);
}

export default function AdminUsers({ navigation }: { navigation: AdminNavigation }) {
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get('filter');
  const [filter, setFilter] = React.useState<AdminUserFilter>(isFilter(initialFilter) ? initialFilter : 'all');
  const [sort, setSort] = React.useState<AdminUserSort>('newest');
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [page, setPage] = React.useState(0);
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  React.useEffect(() => setPage(0), [filter, sort, debouncedQuery]);

  React.useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== '/' || target?.closest('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const url = `/api/admin/users?${new URLSearchParams({
    filter,
    sort,
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    ...(debouncedQuery ? { q: debouncedQuery } : {}),
  })}`;
  const { data, error, loading, reload } = useAdminResource<AdminUserList>(url);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Panel>
      <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email or user id"
            aria-label="Search users"
            className="h-9 pl-8 pr-10"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 text-[10px] text-muted-foreground sm:block">/</kbd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Filter users" value={filter} onChange={setFilter} options={FILTERS} />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as AdminUserSort)}
            aria-label="Sort users"
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="newest">Newest</option>
            <option value="recently-active">Recently active</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
          </select>
          <RefreshButton loading={loading} onClick={() => void reload()} />
        </div>
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : !data ? (
        <LoadingRows rows={8} />
      ) : data.users.length === 0 ? (
        <EmptyState icon={Users} title="No matching users" description={debouncedQuery ? `Nothing matches “${debouncedQuery}”.` : 'Try a different filter.'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Operator</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 text-right font-medium">Live</th>
                <th className="px-3 py-2 text-right font-medium">Labs</th>
                <th className="px-3 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody className={loading ? 'opacity-60 transition-opacity' : undefined}>
              {data.users.map((user) => (
                <tr
                  key={user.id}
                  tabIndex={0}
                  onClick={() => navigation.openUser(user.id)}
                  onKeyDown={(event) => { if (event.key === 'Enter') navigation.openUser(user.id); }}
                  className="cursor-pointer border-b last:border-0 transition hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate font-medium">
                          {user.displayName}
                          {user.isFounder ? <Crown className="h-3.5 w-3.5 text-amber-500" aria-label="Founder" /> : null}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{user.email || 'No email'}{user.email && !user.emailVerified ? ' · unverified' : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><Pill tone={statusTone(user.status)} dot>{user.status}</Pill></td>
                  <td className="px-3 py-2.5">{user.role === 'admin' ? <Pill tone="brand">{user.isFounder ? 'Founder' : 'Admin'}</Pill> : <span className="text-xs text-muted-foreground">User</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{user.liveResources ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">{user.liveResources}</span> : <span className="text-muted-foreground">0</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{user.totalLabs}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{timeAgo(user.createdAt)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{timeAgo(user.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min(data.total, (page + 1) * PAGE_SIZE)} of {data.total.toLocaleString('en')}
          </span>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((value) => value - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="tabular-nums">{page + 1} / {pages}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page + 1 >= pages} onClick={() => setPage((value) => value + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
