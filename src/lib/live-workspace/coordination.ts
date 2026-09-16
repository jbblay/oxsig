import 'server-only';

import type { Pool, PoolClient } from 'pg';
import { stringifyPostgresJson } from '@/lib/db/postgres-safe';

export type LiveWorkspaceActivityEventType =
  | 'note.created'
  | 'note.updated'
  | 'checklist.created'
  | 'checklist.completed'
  | 'checklist.reopened'
  | 'snapshot.created'
  | 'item.deleted'
  | 'resource.attached'
  | 'resource.detached'
  | 'participant.role-changed'
  | 'participant.left'
  | 'participant.removed'
  | 'warroom.handoff-started'
  | 'warroom.linked';

type Queryable = Pick<Pool | PoolClient, 'query'>;

function compactSummary(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= 240 ? normalized : `${normalized.slice(0, 239)}…`;
}

export async function recordLiveWorkspaceActivity(args: {
  queryable: Queryable;
  collaborationId: string;
  actorId?: string | null;
  eventType: LiveWorkspaceActivityEventType;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  const result = await args.queryable.query(
    `INSERT INTO live_workspace_activity_events (
       collaboration_id, actor_id, event_type, summary, metadata
     ) VALUES ($1,$2,$3,$4,$5::jsonb)
     RETURNING id, collaboration_id, actor_id, event_type, summary, metadata, created_at`,
    [
      args.collaborationId,
      args.actorId ?? null,
      args.eventType,
      compactSummary(args.summary),
      stringifyPostgresJson(args.metadata || {}),
    ]
  );
  return result.rows[0];
}

export function liveWorkspaceActivitySummary(prefix: string, content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const excerpt = normalized.length <= 120 ? normalized : `${normalized.slice(0, 117)}…`;
  return excerpt ? `${prefix}: ${excerpt}` : prefix;
}
