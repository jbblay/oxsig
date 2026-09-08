import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { sanitizePostgresText } from '@/lib/db/postgres-safe';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const colorSchema = z.enum(['home', 'labs', 'live', 'collab', 'boards', 'vault', 'manage']);
const kindSchema = z.enum(['navigation', 'action', 'system']);
const internalHrefSchema = z.string().max(320).refine((value) => value.startsWith('/') && !value.startsWith('//'), 'Use an internal workspace path');

const activitySchema = z.object({
  id: z.string().min(1).max(96),
  label: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(320).optional(),
  href: internalHrefSchema.optional(),
  color: colorSchema,
  kind: kindSchema,
  at: z.number().int().positive(),
}).strict();

const recentSchema = z.object({
  href: internalHrefSchema,
  label: z.string().trim().min(1).max(160),
  color: colorSchema,
  at: z.number().int().positive(),
}).strict();

const syncSchema = z.object({
  activity: z.array(activitySchema).max(32).default([]),
  recents: z.array(recentSchema).max(12).default([]),
}).strict();

function safeOccurredAt(value: number) {
  const now = Date.now();
  const oldest = now - 90 * 24 * 60 * 60 * 1000;
  const newest = now + 5 * 60 * 1000;
  return new Date(Math.min(newest, Math.max(oldest, value)));
}

function mapActivity(row: Record<string, any>) {
  return {
    id: row.client_event_id as string,
    label: row.label as string,
    ...(row.detail ? { detail: row.detail as string } : {}),
    ...(row.href ? { href: row.href as string } : {}),
    color: row.color,
    kind: row.kind,
    at: new Date(row.occurred_at).getTime(),
  };
}

function mapRecent(row: Record<string, any>) {
  return {
    href: row.href as string,
    label: row.label as string,
    color: row.color,
    at: new Date(row.last_visited_at).getTime(),
  };
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 120, windowMs: 60_000 }, `${user.id}:workspace-state:read`);
    if (rateLimit) return rateLimit;

    const pool = getPool();
    const [activityResult, recentsResult] = await Promise.all([
      pool.query(
        `SELECT client_event_id, label, detail, href, color, kind, occurred_at
           FROM workspace_activity_events
          WHERE owner_id = $1
          ORDER BY occurred_at DESC
          LIMIT 50`,
        [user.id]
      ),
      pool.query(
        `SELECT href, label, color, last_visited_at
           FROM workspace_recent_workspaces
          WHERE owner_id = $1
          ORDER BY last_visited_at DESC
          LIMIT 12`,
        [user.id]
      ),
    ]);

    return NextResponse.json({
      activity: activityResult.rows.map(mapActivity),
      recents: recentsResult.rows.map(mapRecent),
    }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, `${user.id}:workspace-state:sync`);
    if (rateLimit) return rateLimit;

    const parsed = syncSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid workspace state', details: parsed.error.flatten() }, { status: 400 });
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (const item of parsed.data.activity) {
        await client.query(
          `INSERT INTO workspace_activity_events (
             owner_id, client_event_id, label, detail, href, color, kind, occurred_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (owner_id, client_event_id) DO NOTHING`,
          [
            user.id,
            sanitizePostgresText(item.id),
            sanitizePostgresText(item.label),
            item.detail ? sanitizePostgresText(item.detail) : null,
            item.href ? sanitizePostgresText(item.href) : null,
            item.color,
            item.kind,
            safeOccurredAt(item.at),
          ]
        );
      }

      for (const recent of parsed.data.recents) {
        await client.query(
          `INSERT INTO workspace_recent_workspaces (owner_id, href, label, color, last_visited_at)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (owner_id, href)
           DO UPDATE SET label = EXCLUDED.label,
                         color = EXCLUDED.color,
                         last_visited_at = GREATEST(workspace_recent_workspaces.last_visited_at, EXCLUDED.last_visited_at),
                         updated_at = NOW()`,
          [
            user.id,
            sanitizePostgresText(recent.href),
            sanitizePostgresText(recent.label),
            recent.color,
            safeOccurredAt(recent.at),
          ]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Workspace state sync failed:', error);
      return NextResponse.json({ error: 'Could not sync workspace state' }, { status: 500 });
    } finally {
      client.release();
    }

    return NextResponse.json({ synced: true });
  });
}

export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 20, windowMs: 60_000 }, `${user.id}:workspace-state:clear`);
    if (rateLimit) return rateLimit;

    await getPool().query('DELETE FROM workspace_activity_events WHERE owner_id = $1', [user.id]);
    return NextResponse.json({ cleared: true });
  });
}
