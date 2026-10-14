'use client';

import type { ComponentType } from 'react';
import { AlertTriangle, ArrowRight, Box, Clock3, Crosshair, ShieldAlert, Sparkles, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AdminOverview } from '@/lib/admin/contract';
import type { AdminNavigation } from './AdminConsole';
import {
  actionLabel,
  actionTone,
  Avatar,
  BarChart,
  ErrorState,
  formatCount,
  formatMinutes,
  LoadingRows,
  Panel,
  PanelHeader,
  Pill,
  RefreshButton,
  StatCard,
  statusTone,
  timeAgo,
  useAdminResource,
} from './admin-ui';

function percent(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

export default function AdminOverviewPanel({ navigation }: { navigation: AdminNavigation }) {
  const { data, error, loading, reload } = useAdminResource<AdminOverview>('/api/admin/overview');

  if (error && !data) return <Panel><ErrorState message={error} onRetry={() => void reload()} /></Panel>;
  if (!data) return <Panel><LoadingRows rows={6} /></Panel>;

  const { users, labs, operations } = data;
  const alerts = [
    labs.failed24h + operations.failed24h > 0 && {
      tone: 'bad' as const,
      text: `${labs.failed24h + operations.failed24h} lab or operation failure${labs.failed24h + operations.failed24h === 1 ? '' : 's'} in the last 24h`,
      action: () => navigation.goTo('resources', { filter: 'failed' }),
    },
    data.cleanupBacklog > 0 && {
      tone: 'warn' as const,
      text: `${data.cleanupBacklog} expired resource${data.cleanupBacklog === 1 ? ' is' : 's are'} still alive. Cleanup may be lagging.`,
      action: () => navigation.goTo('resources', { filter: 'expired' }),
    },
    users.suspended > 0 && {
      tone: 'neutral' as const,
      text: `${users.suspended} suspended account${users.suspended === 1 ? '' : 's'}`,
      action: () => navigation.goTo('users', { filter: 'suspended' }),
    },
  ].filter(Boolean) as Array<{ tone: 'bad' | 'warn' | 'neutral'; text: string; action: () => void }>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Updated {timeAgo(data.generatedAt)}</p>
        <RefreshButton loading={loading} onClick={() => void reload()} />
      </div>

      {alerts.length > 0 && (
        <div className="grid gap-2 md:grid-cols-3">
          {alerts.map((alert) => (
            <button
              key={alert.text}
              type="button"
              onClick={alert.action}
              className="group flex items-center gap-3 rounded-xl border bg-card/80 px-3 py-2.5 text-left text-sm transition hover:border-primary/40"
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${alert.tone === 'bad' ? 'bg-rose-500/10 text-rose-500' : alert.tone === 'warn' ? 'bg-amber-500/10 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
                {alert.tone === 'neutral' ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1 text-xs">{alert.text}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users" icon={Users} tone="brand" value={formatCount(users.total)} hint={`+${users.new7d} this week · +${users.new30d} in 30d`} series={data.signups} />
        <StatCard label="Active (7d)" icon={Sparkles} tone="good" value={formatCount(users.active7d)} hint={`${percent(users.active7d, users.total)}% of users · ${users.active24h} today`} series={data.activeUsers.length ? data.activeUsers : undefined} />
        <StatCard label="Live labs" icon={Box} tone="info" value={formatCount(labs.live)} hint={`${labs.launched30d} launched in 30d`} series={data.labLaunches} />
        <StatCard label="Lab runtime (30d)" icon={Clock3} tone="warn" value={formatMinutes(labs.runtimeMinutes30d)} hint={`${operations.live} live operation${operations.live === 1 ? '' : 's'} · ${operations.launched30d} in 30d`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Sign-ups" description="New accounts per day, last 30 days" />
          <div className="p-4"><BarChart points={data.signups} label="Daily sign-ups" /></div>
          <div className="grid grid-cols-3 divide-x border-t text-center">
            <Funnel label="Signed up" value={users.total} />
            <Funnel label="Onboarded" value={users.total - users.onboardingPending} of={users.total} />
            <Funnel label="Active 30d" value={users.active30d} of={users.total} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Newest operators"
            actions={<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigation.goTo('users')}>All users <ArrowRight className="h-3 w-3" /></Button>}
          />
          {data.recentUsers.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">No users yet.</p>
          ) : (
            <ul className="divide-y">
              {data.recentUsers.map((user) => (
                <li key={user.id}>
                  <button type="button" onClick={() => navigation.openUser(user.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-muted/40">
                    <Avatar name={user.displayName} src={user.avatarUrl} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{user.displayName}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{user.email}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">{timeAgo(user.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Resource fleet"
            description="Labs and operation runs by lifecycle state"
            actions={<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigation.goTo('resources')}>Manage <ArrowRight className="h-3 w-3" /></Button>}
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <StatusBreakdown title="Labs" icon={Box} byStatus={labs.byStatus} />
            <StatusBreakdown title="Operations" icon={Crosshair} byStatus={operations.byStatus} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Recent activity"
            actions={<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigation.goTo('activity')}>Audit trail <ArrowRight className="h-3 w-3" /></Button>}
          />
          {data.recentEvents.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">No audited activity yet.</p>
          ) : (
            <ul className="divide-y">
              {data.recentEvents.map((event) => (
                <li key={event.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Pill tone={actionTone(event.action)}>{event.action.split('.')[0]}</Pill>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    <span className="font-medium">{event.actorName || event.actorEmail || 'System'}</span>{' '}
                    <span className="text-muted-foreground">{actionLabel(event.action).toLowerCase()}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <UserPlus className="h-3 w-3" /> {users.admins} platform admin{users.admins === 1 ? '' : 's'} · {users.onboardingPending} account{users.onboardingPending === 1 ? '' : 's'} yet to finish onboarding
      </p>
    </div>
  );
}

function Funnel({ label, value, of }: { label: string; value: number; of?: number }) {
  return (
    <div className="px-3 py-3">
      <div className="text-lg font-semibold tabular-nums">{formatCount(value)}</div>
      <div className="text-[11px] text-muted-foreground">{label}{of ? ` · ${percent(value, of)}%` : ''}</div>
    </div>
  );
}

function StatusBreakdown({ title, icon: Icon, byStatus }: { title: string; icon: ComponentType<{ className?: string }>; byStatus: Record<string, number> }) {
  const entries = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{title}<span className="ml-auto font-normal tabular-nums text-muted-foreground">{formatCount(total)} total</span></div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">None yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map(([status, count]) => (
            <li key={status} className="flex items-center gap-2">
              <Pill tone={statusTone(status)} className="w-24 justify-center">{status}</Pill>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${percent(count, total)}%` }} />
              </div>
              <span className="w-10 text-right text-xs tabular-nums">{formatCount(count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
