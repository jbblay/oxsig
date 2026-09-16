import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const statusSchema = z.object({
  status: z.enum(['available', 'busy', 'away', 'focus']),
  message: z.string().trim().max(80).nullable().optional(),
}).strict();

function mapStatus(row: Record<string, unknown>) {
  return {
    status: String(row.collaboration_status || 'available'),
    message: typeof row.collaboration_status_message === 'string' ? row.collaboration_status_message : '',
  };
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (_req, user) => {
    const result = await getPool().query(
      `SELECT collaboration_status, collaboration_status_message
         FROM users
        WHERE id = $1 AND is_active = true
        LIMIT 1`,
      [user.id]
    );
    if (!result.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json(mapStatus(result.rows[0]));
  });
}

export async function PATCH(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60 * 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = statusSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Choose a valid status and keep the message under 80 characters' }, { status: 400 });
    }

    const message = parsed.data.message?.trim() || null;
    const result = await getPool().query(
      `UPDATE users
          SET collaboration_status = $2,
              collaboration_status_message = $3,
              updated_at = NOW()
        WHERE id = $1 AND is_active = true
      RETURNING collaboration_status, collaboration_status_message`,
      [user.id, parsed.data.status, message]
    );
    if (!result.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json(mapStatus(result.rows[0]));
  });
}
