'use client';

import * as React from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCsrfToken } from '@/lib/security/csrf-client';
import { cn } from '@/lib/utils';
import type { AdminSeriesPoint } from '@/lib/admin/contract';

/* ------------------------------------------------------------------ data */

export class AdminRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readError(response: Response) {
  const body = await response.json().catch(() => ({}));
  return new AdminRequestError(body?.error || body?.message || `Request failed (${response.status})`, response.status);
}

export function useAdminResource<T>(url: string | null) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(Boolean(url));
  const requestId = React.useRef(0);

  const load = React.useCallback(async () => {
    if (!url) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'include' });
      if (!response.ok) throw await readError(response);
      const next = (await response.json()) as T;
      if (id === requestId.current) {
        setData(next);
        setError(null);
      }
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [url]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

export async function adminMutate<T = Record<string, unknown>>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<T>;
}

/* ------------------------------------------------------------- formatting */

const numberFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function formatCount(value: number) {
  return value < 10_000 ? value.toLocaleString('en') : numberFormat.format(value);
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return hours < 100 ? `${hours.toFixed(1)}h` : `${formatCount(Math.round(hours))}h`;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

export function timeAgo(value: string | null | undefined) {
  if (!value) return 'Never';
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relative.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(diff / 3600), 'hour');
  if (abs < 2_592_000) return relative.format(Math.round(diff / 86_400), 'day');
  if (abs < 31_536_000) return relative.format(Math.round(diff / 2_592_000), 'month');
  return relative.format(Math.round(diff / 31_536_000), 'year');
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });
}

export function initials(value?: string | null) {
  const parts = (value || 'O').trim().split(/[\s@._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'O';
}

/* ------------------------------------------------------------- primitives */

export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border bg-card/80 shadow-sm shadow-black/[0.03] backdrop-blur-sm', className)} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3 border-b px-4 py-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

const TONES = {
  neutral: 'border-border bg-muted/60 text-muted-foreground',
  good: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  info: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  bad: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  brand: 'border-primary/30 bg-primary/10 text-primary',
} as const;

export type Tone = keyof typeof TONES;

export function Pill({ tone = 'neutral', dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[10px] font-semibold uppercase tracking-wide', TONES[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  if (['running', 'active'].includes(status)) return 'good';
  if (['provisioning', 'created', 'starting', 'resetting'].includes(status)) return 'info';
  if (['stopping', 'stopped', 'destroying', 'suspended'].includes(status)) return 'warn';
  if (['failed', 'deactivated'].includes(status)) return 'bad';
  return 'neutral';
}

export function Avatar({ name, src, size = 32, className }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary/25 to-primary/5 font-semibold text-primary ring-1 ring-border', className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  series,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  series?: AdminSeriesPoint[];
}) {
  return (
    <Panel className="relative overflow-hidden p-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {Icon ? <span className={cn('grid h-6 w-6 place-items-center rounded-md border', TONES[tone])}><Icon className="h-3.5 w-3.5" /></span> : null}
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      {series && series.length > 1 ? <Sparkline points={series} className="mt-3 h-10 w-full" /> : null}
    </Panel>
  );
}

export function Sparkline({ points, className }: { points: AdminSeriesPoint[]; className?: string }) {
  const id = React.useId();
  const max = Math.max(1, ...points.map((point) => point.value));
  const step = 100 / Math.max(1, points.length - 1);
  const coords = points.map((point, index) => [index * step, 30 - (point.value / max) * 26 - 2] as const);
  const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L100,30 L0,30 Z`;
  const total = points.reduce((sum, point) => sum + point.value, 0);
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn('text-primary', className)} role="img" aria-label={`${total} over ${points.length} days`}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function BarChart({ points, label }: { points: AdminSeriesPoint[]; label: string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  return (
    <div>
      <div className="flex h-36 items-end gap-[3px]" role="img" aria-label={label}>
        {points.map((point) => (
          <div key={point.date} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-sm bg-primary/70 transition-colors group-hover:bg-primary"
              style={{ height: `${Math.max(point.value ? 4 : 1.5, (point.value / max) * 100)}%`, opacity: point.value ? 1 : 0.25 }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[10px] shadow-md group-hover:block">
              <span className="font-semibold tabular-nums">{point.value}</span>{' '}
              <span className="text-muted-foreground">{new Date(point.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{points[0] ? new Date(points[0].date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : ''}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string; count?: number }>; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-lg border bg-muted/40 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition',
            value === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
          {typeof option.count === 'number' ? <span className="tabular-nums text-[10px] text-muted-foreground">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-1/5 animate-pulse rounded bg-muted/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-500"><AlertTriangle className="h-5 w-5" /></span>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry ? <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full border bg-muted/50 text-muted-foreground"><Icon className="h-5 w-5" /></span>
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={onClick} disabled={loading} aria-label="Refresh">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">Refresh</span>
    </Button>
  );
}

export function actionLabel(action: string) {
  const known: Record<string, string> = {
    'admin.user.suspend': 'Suspended a user',
    'admin.user.restore': 'Restored a user',
    'admin.user.role': 'Changed a role',
    'admin.user.delete': 'Deleted a user',
    'admin.user.terminate_resources': 'Terminated user resources',
    'admin.lab.destroy': 'Force-destroyed a lab',
    'admin.operation.destroy': 'Force-destroyed an operation',
    'account.export': 'Exported account data',
    'account.deleted': 'Deleted own account',
    'lab.create': 'Created a lab',
    'lab.start': 'Started a lab',
    'lab.stop': 'Stopped a lab',
    'lab.destroy': 'Destroyed a lab',
    'lab.session.start': 'Opened a lab session',
    'lab.command': 'Ran a lab command',
    'deployment.execute': 'Executed a deployment',
    'storyboard.create': 'Created a board',
    'storyboard.share': 'Shared a board',
  };
  return known[action] ?? action.replace(/[._]/g, ' ');
}

export function actionTone(action: string): Tone {
  if (action.startsWith('admin.')) return 'brand';
  if (action.includes('failed') || action.includes('delete')) return 'bad';
  if (action.includes('destroy') || action.includes('suspend')) return 'warn';
  return 'neutral';
}
