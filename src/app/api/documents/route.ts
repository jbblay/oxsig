import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserFromRequest } from '@/lib/auth/middleware';
import { demoReadOnlyResponse } from '@/lib/auth/demo';
import { AUDIT_ACTIONS, logDocumentEvent } from '@/lib/audit/logger';
import { query as dbQuery } from '@/lib/db/pool';
import { mapDocumentRow } from '@/lib/documents/map-document';
import { metadataSchema } from '@/lib/http/schemas';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';

const documentSchema = z.object({
  title: z.string().trim().min(1).max(500),
  content: z.string().max(5_000_000).default(''),
  contentType: z.string().trim().min(1).max(50).default('text/plain'),
  metadata: metadataSchema.default({}),
  tags: z.array(z.string().trim().min(1).max(64)).max(25).default([]),
  status: z.enum(['draft', 'ready']).default('draft'),
});

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.role === 'demo') {
    const page = positiveInteger(request.nextUrl.searchParams.get('page'), 1, 100_000);
    const pageSize = positiveInteger(request.nextUrl.searchParams.get('pageSize'), 20, 100);
    return NextResponse.json({ data: [], total: 0, page, pageSize, hasMore: false });
  }

  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get('query')?.trim();
    const tags = searchParams.get('tags')?.split(',').map((tag) => tag.trim()).filter(Boolean);
    const status = searchParams.get('status')?.trim();
    const sortMap: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      title: 'title',
    };
    const sortBy = sortMap[searchParams.get('sortBy') || 'createdAt'] || 'created_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'ASC' : 'DESC';
    const page = positiveInteger(searchParams.get('page'), 1, 100_000);
    const pageSize = positiveInteger(searchParams.get('pageSize'), 20, 100);
    const offset = (page - 1) * pageSize;

    const conditions = ['owner_id = $1', 'deleted_at IS NULL'];
    const values: any[] = [user.id];
    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(title ILIKE $${values.length} OR content ILIKE $${values.length})`);
    }
    if (tags?.length) {
      values.push(tags);
      conditions.push(`tags && $${values.length}::text[]`);
    }
    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }
    const where = conditions.join(' AND ');
    const countResult = await dbQuery(`SELECT COUNT(*) FROM documents WHERE ${where}`, values);
    const total = Number.parseInt(countResult.rows[0].count, 10);

    values.push(pageSize, offset);
    const result = await dbQuery(
      `SELECT id, title, content_type, owner_id, encrypted, file_url,
              file_size, mime_type, storage_key, content_hash, metadata, tags,
              status, version, created_at, updated_at
       FROM documents
       WHERE ${where}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    return NextResponse.json({
      data: result.rows.map(mapDocumentRow),
      total,
      page,
      pageSize,
      hasMore: offset + pageSize < total,
    });
  } catch (error) {
    console.error('Document list failed:', error);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'demo') return demoReadOnlyResponse();
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.API_DOCUMENTS, user.id);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const parsed = documentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid document', message: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    }
    const document = parsed.data;
    const contentHash = createHash('sha256').update(document.content, 'utf8').digest('hex');
    const result = await dbQuery(
      `INSERT INTO documents (
         title, content, content_type, owner_id, encrypted, content_hash,
         metadata, tags, status, version
       ) VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8, 1)
       RETURNING id, title, content, content_type, owner_id, encrypted, file_url,
                 file_size, mime_type, storage_key, content_hash, metadata, tags,
                 status, version, created_at, updated_at`,
      [
        document.title,
        document.content,
        document.contentType,
        user.id,
        contentHash,
        document.metadata,
        document.tags,
        document.status,
      ],
    );
    await logDocumentEvent(AUDIT_ACTIONS.DOCUMENT_CREATE, user.id, result.rows[0].id, request, {
      kind: 'text',
    });
    return NextResponse.json(mapDocumentRow(result.rows[0]), { status: 201 });
  } catch (error) {
    console.error('Document creation failed:', error);
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 });
  }
}
