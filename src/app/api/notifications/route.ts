import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { mapWorkspaceNotification } from '@/lib/notifications/server';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).max(50).optional(),
  all: z.literal(true).optional(),
}).strict().refine((value) => value.all || (value.ids && value.ids.length > 0), 'Provide notification ids or all=true');

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 120, windowMs: 60_000 }, `${user.id}:notifications:read`);
    if (rateLimit) return rateLimit;

    const result = await getPool().query(
      `SELECT *
         FROM workspace_notifications
        WHERE owner_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [user.id]
    );
    const notifications = result.rows.map(mapWorkspaceNotification);
    return NextResponse.json({
      notifications,
      unreadCount: notifications.filter((item) => !item.readAt).length,
    }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function PATCH(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, `${user.id}:notifications:update`);
    if (rateLimit) return rateLimit;

    const parsed = markReadSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid notification update' }, { status: 400 });
    }

    if (parsed.data.all) {
      await getPool().query(
        `UPDATE workspace_notifications
            SET read_at = COALESCE(read_at, NOW())
          WHERE owner_id = $1 AND read_at IS NULL`,
        [user.id]
      );
    } else {
      await getPool().query(
        `UPDATE workspace_notifications
            SET read_at = COALESCE(read_at, NOW())
          WHERE owner_id = $1 AND id = ANY($2::uuid[])`,
        [user.id, parsed.data.ids || []]
      );
    }

    return NextResponse.json({ updated: true });
  });
}
