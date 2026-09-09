import 'server-only';

import type { Pool, PoolClient } from 'pg';
import { getPool } from '@/lib/db/pool';
import { sanitizePostgresText } from '@/lib/db/postgres-safe';
import type { WorkspaceNotification, WorkspaceNotificationSeverity } from './types';

type Queryable = Pick<Pool | PoolClient, 'query'>;

export function mapWorkspaceNotification(row: Record<string, any>): WorkspaceNotification {
  return {
    id: row.id as string,
    type: row.notification_type as string,
    title: row.title as string,
    ...(row.detail ? { detail: row.detail as string } : {}),
    ...(row.href ? { href: row.href as string } : {}),
    severity: row.severity as WorkspaceNotificationSeverity,
    ...(row.read_at ? { readAt: new Date(row.read_at).getTime() } : {}),
    at: new Date(row.created_at).getTime(),
  };
}

export async function createWorkspaceNotification(args: {
  ownerId: string;
  type: string;
  title: string;
  detail?: string | null;
  href?: string | null;
  severity?: WorkspaceNotificationSeverity;
  sourceType?: string | null;
  sourceId?: string | null;
  dedupeKey?: string | null;
  queryable?: Queryable;
}) {
  const queryable = args.queryable || getPool();
  const result = await queryable.query(
    `INSERT INTO workspace_notifications (
       owner_id, notification_type, title, detail, href, severity,
       source_type, source_id, dedupe_key
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (owner_id, dedupe_key) DO NOTHING
     RETURNING *`,
    [
      args.ownerId,
      sanitizePostgresText(args.type).slice(0, 80),
      sanitizePostgresText(args.title).slice(0, 160),
      args.detail ? sanitizePostgresText(args.detail).slice(0, 320) : null,
      args.href ? sanitizePostgresText(args.href).slice(0, 320) : null,
      args.severity || 'info',
      args.sourceType ? sanitizePostgresText(args.sourceType).slice(0, 80) : null,
      args.sourceId ? sanitizePostgresText(args.sourceId).slice(0, 160) : null,
      args.dedupeKey ? sanitizePostgresText(args.dedupeKey).slice(0, 240) : null,
    ]
  );
  return result.rows[0] ? mapWorkspaceNotification(result.rows[0]) : null;
}
