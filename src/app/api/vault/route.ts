import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import { sanitizePostgresText, stringifyPostgresJson } from '@/lib/db/postgres-safe';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { VAULT_KINDS, type VaultKind } from '@/lib/vault/types';
import { mapVaultRow, normalizeVaultTags, vaultCreateSchema } from '@/lib/vault/server';

export const runtime = 'nodejs';

function isVaultKind(value: string | null): value is VaultKind {
  return !!value && (VAULT_KINDS as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    const rateLimit = await checkRateLimit(req, { maxRequests: 120, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 120);
    const kindParam = url.searchParams.get('kind');
    const pinned = url.searchParams.get('pinned') === 'true';
    const includeArchived = url.searchParams.get('archived') === 'true';

    if (kindParam && !isVaultKind(kindParam)) {
      return NextResponse.json({ error: 'Invalid Vault item type' }, { status: 400 });
    }

    const clauses = ['owner_id = $1'];
    const params: unknown[] = [user.id];

    if (!includeArchived) clauses.push('archived = false');
    if (kindParam) {
      params.push(kindParam);
      clauses.push(`kind = $${params.length}`);
    }
    if (pinned) clauses.push('pinned = true');
    if (q) {
      params.push(`%${sanitizePostgresText(q)}%`);
      const index = params.length;
      clauses.push(`(
        title ILIKE $${index}
        OR summary ILIKE $${index}
        OR body ILIKE $${index}
        OR array_to_string(tags, ' ') ILIKE $${index}
      )`);
    }

    const result = await getPool().query(
      `SELECT *
       FROM vault_items
       WHERE ${clauses.join(' AND ')}
       ORDER BY pinned DESC, updated_at DESC
       LIMIT 250`,
      params
    );

    return NextResponse.json({ items: result.rows.map(mapVaultRow) });
  });
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const rateLimit = await checkRateLimit(req, { maxRequests: 40, windowMs: 60_000 }, user.id);
    if (rateLimit) return rateLimit;

    const parsed = vaultCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid Vault item', details: parsed.error.flatten() }, { status: 400 });
    }

    const item = parsed.data;
    const tags = normalizeVaultTags(item.tags).map(sanitizePostgresText);
    const result = await getPool().query(
      `INSERT INTO vault_items (
         owner_id, kind, title, summary, body, language, tags,
         pinned, source_type, source_id, metadata
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       RETURNING *`,
      [
        user.id,
        item.kind,
        sanitizePostgresText(item.title),
        sanitizePostgresText(item.summary),
        sanitizePostgresText(item.body),
        item.language ? sanitizePostgresText(item.language) : null,
        tags,
        item.pinned,
        sanitizePostgresText(item.sourceType || 'manual'),
        item.sourceId ? sanitizePostgresText(item.sourceId) : null,
        stringifyPostgresJson(item.metadata || {}),
      ]
    );

    return NextResponse.json({ item: mapVaultRow(result.rows[0]) }, { status: 201 });
  });
}
