import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { deleteCollaborationObjects } from '@/lib/collab/storage';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid();
const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'No collaboration changes supplied');

function mapCollaboration(row: Record<string, any>, viewerId: string) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    ownerId: row.owner_id,
    collaborationType: row.collaboration_type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isOwner: row.owner_id === viewerId,
  };
}

async function hasPersistedAttachments(pool: ReturnType<typeof getPool>, collaborationId: string) {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
         FROM collaboration_messages
        WHERE collaboration_id = $1
          AND metadata ? 'attachment'
     ) AS has_attachments`,
    [collaborationId]
  );
  return Boolean(result.rows[0]?.has_attachments);
}

export async function GET(request: NextRequest, context: Context) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 90, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await context.params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    }

    const result = await getPool().query(
      `SELECT c.id, c.name, c.description, c.owner_id, c.collaboration_type,
              c.status, c.created_at, c.updated_at
         FROM collaborations c
         LEFT JOIN collaboration_members member
           ON member.collaboration_id = c.id
          AND member.user_id = $2
          AND member.status = 'active'
        WHERE c.id = $1
          AND c.status = 'active'
          AND (c.owner_id = $2 OR member.user_id = $2)
        LIMIT 1`,
      [id, user.id]
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
    }

    return NextResponse.json(
      { collaboration: mapCollaboration(result.rows[0], user.id) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  });
}

export async function PATCH(request: NextRequest, context: Context) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await context.params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    }
    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid collaboration update' }, { status: 400 });
    }

    const patch = parsed.data;
    const result = await getPool().query(
      `UPDATE collaborations
          SET name = COALESCE($3, name),
              description = CASE WHEN $4::boolean THEN $5 ELSE description END,
              updated_at = NOW()
        WHERE id = $1 AND owner_id = $2 AND status = 'active'
        RETURNING id, name, description, owner_id, collaboration_type,
                  status, created_at, updated_at`,
      [
        id,
        user.id,
        patch.name ?? null,
        Object.hasOwn(patch, 'description'),
        patch.description ?? null,
      ]
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: 'Collaboration not found or owner access required' }, { status: 404 });
    }

    return NextResponse.json({ collaboration: mapCollaboration(result.rows[0], user.id) });
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(req, { maxRequests: 10, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await context.params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    }

    const pool = getPool();
    const owned = await pool.query(
      `SELECT id
         FROM collaborations
        WHERE id = $1 AND owner_id = $2
        LIMIT 1`,
      [id, user.id]
    );
    if (!owned.rows[0]) {
      return NextResponse.json({ error: 'Collaboration not found or owner access required' }, { status: 404 });
    }

    let attachmentCleanupDeferred = false;
    try {
      await deleteCollaborationObjects(id);
    } catch (error) {
      const persistedAttachments = await hasPersistedAttachments(pool, id).catch(() => true);
      if (persistedAttachments) {
        console.warn('Collaboration attachment cleanup failed; database deletion was not attempted:', error);
        return NextResponse.json(
          { error: 'Could not delete collaboration attachments. Nothing was deleted.' },
          { status: 503 }
        );
      }
      attachmentCleanupDeferred = true;
      console.warn('Collaboration storage cleanup was unavailable, but no persisted attachment references exist; continuing relational deletion:', error);
    }

    const result = await pool.query(
      `DELETE FROM collaborations
        WHERE id = $1 AND owner_id = $2
        RETURNING id`,
      [id, user.id]
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: 'Collaboration changed before deletion; try again' }, { status: 409 });
    }

    return NextResponse.json({ deleted: true, ...(attachmentCleanupDeferred ? { attachmentCleanupDeferred: true } : {}) });
  });
}
