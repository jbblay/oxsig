'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, CircleDashed, Database, GitCommit, Recycle, XCircle } from 'lucide-react';
import type { AdminSystemStatus } from '@/lib/admin/contract';
import {
  ErrorState,
  formatDateTime,
  LoadingRows,
  Panel,
  PanelHeader,
  Pill,
  RefreshButton,
  timeAgo,
  useAdminResource,
} from './admin-ui';

export default function AdminSystem() {
  const { data, error, loading, reload } = useAdminResource<AdminSystemStatus>('/api/admin/system');

  if (error && !data) return <Panel><ErrorState message={error} onRetry={() => void reload()} /></Panel>;
  if (!data) return <Panel><LoadingRows rows={6} /></Panel>;

  const missingRequired = data.integrations.filter((item) => item.required && !item.configured);
  const cleanupStale = data.lifecycle.lastCleanupAt ? Date.now() - new Date(data.lifecycle.lastCleanupAt).getTime() > 36 * 3_600_000 : true;
  const healthy = data.database.ok && missingRequired.length === 0 && !data.database.pendingAdminMigration;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Pill tone={healthy ? 'good' : 'warn'} dot>{healthy ? 'All core systems ready' : 'Attention needed'}</Pill>
        <span className="text-xs text-muted-foreground">Checked {timeAgo(data.generatedAt)}</span>
        <span className="ml-auto" />
        <RefreshButton loading={loading} onClick={() => void reload()} />
      </div>

      {data.database.pendingAdminMigration && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Migration <span className="font-mono">057_platform_admin_and_account_lifecycle.sql</span> has not been applied. Run <span className="font-mono">pnpm db:migrate</span> to enable suspension, onboarding and the new profile fields.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <PanelHeader title={<span className="flex items-center gap-2"><Database className="h-4 w-4 text-muted-foreground" />Database</span>} />
          <dl className="space-y-2.5 p-4 text-sm">
            <Row label="Connection" value={<Pill tone={data.database.ok ? 'good' : 'bad'} dot>{data.database.ok ? 'Online' : 'Unreachable'}</Pill>} />
            <Row label="Latency" value={data.database.latencyMs === null ? '—' : `${data.database.latencyMs} ms`} />
            <Row label="Migrations" value={data.database.migrationsApplied} />
            <Row label="Latest" value={<span className="font-mono text-xs">{data.database.latestMigration || '—'}</span>} />
            <Row label="Applied" value={formatDateTime(data.database.latestMigrationAt)} />
          </dl>
        </Panel>

        <Panel>
          <PanelHeader title={<span className="flex items-center gap-2"><Recycle className="h-4 w-4 text-muted-foreground" />Lifecycle automation</span>} />
          <dl className="space-y-2.5 p-4 text-sm">
            <Row label="Last cleanup run" value={<span className={cleanupStale ? 'text-amber-600 dark:text-amber-400' : undefined}>{data.lifecycle.lastCleanupAt ? timeAgo(data.lifecycle.lastCleanupAt) : 'No record'}</span>} />
            <Row label="Expired, still alive" value={<Pill tone={data.lifecycle.cleanupBacklog ? 'warn' : 'good'}>{data.lifecycle.cleanupBacklog}</Pill>} />
            <Row label="Failed labs (24h)" value={<Pill tone={data.lifecycle.failedLabs24h ? 'bad' : 'good'}>{data.lifecycle.failedLabs24h}</Pill>} />
            <Row label="Failed operations (24h)" value={<Pill tone={data.lifecycle.failedOperations24h ? 'bad' : 'good'}>{data.lifecycle.failedOperations24h}</Pill>} />
          </dl>
        </Panel>

        <Panel>
          <PanelHeader title={<span className="flex items-center gap-2"><GitCommit className="h-4 w-4 text-muted-foreground" />Deployment</span>} />
          <dl className="space-y-2.5 p-4 text-sm">
            <Row label="Environment" value={data.environment.vercelEnv || data.environment.nodeEnv} />
            <Row label="Commit" value={<span className="font-mono text-xs">{data.environment.commit || 'local'}</span>} />
            <Row label="Branch" value={<span className="font-mono text-xs">{data.environment.branch || '—'}</span>} />
            <Row label="Region" value={data.environment.region || '—'} />
          </dl>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Integrations" description="Only presence is checked. Secret values are never sent to the browser." />
        <ul className="grid divide-y sm:grid-cols-2 sm:divide-y-0">
          {data.integrations.map((item) => (
            <li key={item.id} className="flex items-center gap-3 border-b px-4 py-3 sm:[&:nth-last-child(-n+2)]:border-b-0">
              {item.configured ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : item.required ? (
                <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
              ) : (
                <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{item.label}</div>
                <div className="truncate text-xs text-muted-foreground">{item.detail}</div>
              </div>
              <Pill tone={item.configured ? 'good' : item.required ? 'bad' : 'neutral'}>{item.configured ? 'Ready' : item.required ? 'Missing' : 'Optional'}</Pill>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
