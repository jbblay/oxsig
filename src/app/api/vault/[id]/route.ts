import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { mapVaultRow, normalizeVaultTags, vaultUpdateSchema } from '@/lib/vault/server';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

async function ownedVaultItem(id: string, ownerId: string) {
  const result = await getPool().query(
    `SELECT * FROM vault_items WHERE id = $1 AND owner_id = $2 LIMIT 1`,
    [id, ownerId]
  );
  return result.rows[0] || null;
}

export async function GET(request: NextRequest, context: Context) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 120, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await context.params;
    const row = await ownedVaultItem(id, user.id);
    if (!row) return NextResponse.json({ error: 'Vault item not found' }, { status: 404 });
    return NextResponse.json({ item: mapVaultRow(row) });
  });
}

export async function PATCH(request: NextRequest, context: Context) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 60, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = vaultUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid Vault update', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await context.params;
    const existing = await ownedVaultItem(id, user.id);
    if (!existing) return NextResponse.json({ error: 'Vault item not found' }, { status: 404 });

    const patch = parsed.data;
    const result = await getPool().query(
      `UPDATE vault_items
       SET kind = $3,
           title = $4,
           summary = $5,
           body = $6,
           language = $7,
           tags = $8,
           pinned = $9,
           archived = $10,
           source_type = $11,
           source_id = $12,
           metadata = $13::jsonb,
           updated_at = NOW()
       WHERE id = $1 AND owner_id = $2
       RETURNING *`,
      [
        id,
        user.id,
        patch.kind ?? existing.kind,
        patch.title ?? existing.title,
        patch.summary ?? existing.summary,
        patch.body ?? existing.body,
        patch.language !== undefined ? patch.language : existing.language,
        patch.tags !== undefined ? normalizeVaultTags(patch.tags) : existing.tags,
        patch.pinned ?? existing.pinned,
        patch.archived ?? existing.archived,
        patch.sourceType !== undefined ? patch.sourceType : existing.source_type,
        patch.sourceId !== undefined ? patch.sourceId : existing.source_id,
        JSON.stringify(patch.metadata ?? existing.metadata ?? {}),
      ]
    );

    return NextResponse.json({ item: mapVaultRow(result.rows[0]) });
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 30, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const { id } = await context.params;
    const result = await getPool().query(
      `DELETE FROM vault_items WHERE id = $1 AND owner_id = $2 RETURNING id`,
      [id, user.id]
    );
    if (!result.rows[0]) return NextResponse.json({ error: 'Vault item not found' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  });
}
