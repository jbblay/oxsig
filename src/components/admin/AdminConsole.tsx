'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Activity, BadgeCheck, Boxes, Gauge, ServerCog, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth/use-auth';
import { cn } from '@/lib/utils';
import AdminActivity from './AdminActivity';
import AdminMentors from './AdminMentors';
import AdminOverviewPanel from './AdminOverview';
import AdminResources from './AdminResources';
import AdminSystem from './AdminSystem';
import AdminUsers from './AdminUsers';
import AdminUserDrawer from './AdminUserDrawer';
import { Pill } from './admin-ui';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'resources', label: 'Labs & operations', icon: Boxes },
  { id: 'mentors', label: 'Mentors', icon: BadgeCheck },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'system', label: 'System', icon: ServerCog },
] as const;

export type AdminTab = (typeof TABS)[number]['id'];

export interface AdminNavigation {
  goTo: (tab: AdminTab, extra?: Record<string, string | null>) => void;
  openUser: (userId: string) => void;
}

export default function AdminConsole() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const raw = searchParams.get('tab');
  const tab: AdminTab = TABS.some((item) => item.id === raw) ? (raw as AdminTab) : 'overview';
  const selectedUserId = searchParams.get('user');
  const [dataVersion, setDataVersion] = React.useState(0);

  const updateParams = React.useCallback((changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const navigation = React.useMemo<AdminNavigation>(() => ({
    goTo: (nextTab, extra = {}) => updateParams({ tab: nextTab === 'overview' ? null : nextTab, ...extra }),
    openUser: (userId) => updateParams({ user: userId }),
  }), [updateParams]);

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-5" data-testid="admin-console">
      <header className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.09] via-card to-card px-5 py-5 sm:px-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Platform console</h1>
              <Pill tone="brand" dot>Admin</Pill>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Signed in as {user?.displayName || user?.email || 'admin'} · every action here is recorded in the audit trail.
            </p>
          </div>
        </div>

        <nav className="relative -mb-5 mt-5 flex gap-1 overflow-x-auto" aria-label="Console sections">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigation.goTo(item.id, { user: null })}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
                  active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <section key={`${tab}-${dataVersion}`} className="min-w-0" aria-label={TABS.find((item) => item.id === tab)?.label}>
        {tab === 'overview' && <AdminOverviewPanel navigation={navigation} />}
        {tab === 'users' && <AdminUsers navigation={navigation} />}
        {tab === 'resources' && <AdminResources navigation={navigation} />}
        {tab === 'mentors' && <AdminMentors currentAdminId={user?.id ?? null} />}
        {tab === 'activity' && <AdminActivity navigation={navigation} />}
        {tab === 'system' && <AdminSystem />}
      </section>

      <AdminUserDrawer
        userId={selectedUserId}
        currentAdminId={user?.id ?? null}
        onClose={() => updateParams({ user: null })}
        onChanged={() => setDataVersion((value) => value + 1)}
      />
    </div>
  );
}
