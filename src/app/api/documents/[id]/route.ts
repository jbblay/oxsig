import { createHash } from 'node:crypto';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserFromRequest } from '@/lib/auth/middleware';
import { AUDIT_ACTIONS, logDocumentEvent } from '@/lib/audit/logger';
import { query as dbQuery, transaction } from '@/lib/db/pool';
import { mapDocumentRow } from '@/lib/documents/map-document';
import { metadataSchema, uuidSchema } from '@/lib/http/schemas';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { getS3Client } from '@/lib/storage/s3-server';
import { getDocumentObjectLocation } from '@/lib/storage/document-location';

const updateSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  content: z.string().max(5_000_000).optional(),
  contentType: z.string().trim().min(1).max(50).optional(),
  metadata: metadataSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(25).optional(),
  status: z.enum(['draft', 'ready']).optional(),
}).refine((value) => Object.keys(value).length > 0, 'No fields to update');

const selectColumns = `
  id, title, content, content_type, owner_id, encrypted, file_url,
  file_size, mime_type, storage_key, content_hash, metadata, tags,
  status, version, created_at, updated_at
`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.API_DOCUMENTS, user.id);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }
    const result = await dbQuery(
      `SELECT ${selectColumns}
       FROM documents
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [id, user.id],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    return NextResponse.json(mapDocumentRow(result.rows[0]));
  } catch (error) {
    console.error('Document fetch failed:', error);
    return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.API_DOCUMENTS, user.id);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid update', message: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    }
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }
    const response = await transaction(async (client) => {
      const existing = await client.query(
        `SELECT status, storage_key, file_url FROM documents
         WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [id, user.id],
      );
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      if (existing.rows[0].status === 'signed' && (
        parsed.data.content !== undefined ||
        parsed.data.contentType !== undefined ||
        parsed.data.status !== undefined
      )) {
        return NextResponse.json(
          { error: 'Signed document content is immutable' },
          { status: 409 },
        );
      }
      if ((existing.rows[0].storage_key || existing.rows[0].file_url) && parsed.data.content !== undefined) {
        return NextResponse.json(
          { error: 'Uploaded file content cannot be replaced through this endpoint' },
          { status: 409 },
        );
      }

      const updates: string[] = [];
      const values: any[] = [];
      const columns: Array<[keyof typeof parsed.data, string]> = [
        ['title', 'title'],
        ['content', 'content'],
        ['contentType', 'content_type'],
        ['metadata', 'metadata'],
        ['tags', 'tags'],
        ['status', 'status'],
      ];
      for (const [key, column] of columns) {
        const value = parsed.data[key];
        if (value !== undefined) {
          values.push(value);
          updates.push(`${column} = $${values.length}`);
        }
      }
      if (parsed.data.content !== undefined) {
        values.push(createHash('sha256').update(parsed.data.content, 'utf8').digest('hex'));
        updates.push(`content_hash = $${values.length}`);
      }
      values.push(id, user.id);
      const result = await client.query(
        `UPDATE documents
         SET ${updates.join(', ')}, version = version + 1, updated_at = NOW()
         WHERE id = $${values.length - 1} AND owner_id = $${values.length} AND deleted_at IS NULL
         RETURNING ${selectColumns}`,
        values,
      );
      return NextResponse.json(mapDocumentRow(result.rows[0]));
    });
    return response;
  } catch (error) {
    console.error('Document update failed:', error);
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.API_DOCUMENTS, user.id);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }
    const response = await transaction(async (client) => {
      const existing = await client.query(
        `SELECT d.storage_key, d.file_url,
                EXISTS (
                  SELECT 1 FROM signatures s
                  WHERE s.document_id = d.id AND s.verified = true
                ) AS has_verified_signature
         FROM documents d
         WHERE d.id = $1 AND d.owner_id = $2 AND d.deleted_at IS NULL
         FOR UPDATE`,
        [id, user.id],
      );
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      if (existing.rows[0].has_verified_signature) {
        return NextResponse.json(
          { error: 'Signed documents are immutable and cannot be deleted' },
          { status: 409 },
        );
      }
      const location = getDocumentObjectLocation(
        existing.rows[0].storage_key,
        existing.rows[0].file_url,
      );
      if (location) {
        await getS3Client().send(new DeleteObjectCommand({
          Bucket: location.bucket,
          Key: location.key,
        }));
      }
      await client.query(
        `UPDATE documents SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id],
      );
      return NextResponse.json({ success: true });
    });
    if (response.ok) {
      await logDocumentEvent(AUDIT_ACTIONS.DOCUMENT_DELETE, user.id, id, request);
    }
    return response;
  } catch (error) {
    console.error('Document deletion failed:', error);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}
