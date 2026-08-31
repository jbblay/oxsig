import { createHash, randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserFromRequest } from '@/lib/auth/middleware';
import { demoReadOnlyResponse } from '@/lib/auth/demo';
import { AUDIT_ACTIONS, logDocumentEvent } from '@/lib/audit/logger';
import { getPool } from '@/lib/db/pool';
import { mapDocumentRow } from '@/lib/documents/map-document';
import { metadataSchema as boundedMetadataSchema } from '@/lib/http/schemas';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { ensureDocumentBucket, getS3Client } from '@/lib/storage/s3-server';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 128 * 1024;
const metadataSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(25).default([]),
  status: z.enum(['draft', 'ready']).default('ready'),
  metadata: boundedMetadataSchema.default({}),
});

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'demo') return demoReadOnlyResponse();
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.API_DOCUMENTS, user.id);
  if (rateLimitResponse) return rateLimitResponse;

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_SIZE) {
    return NextResponse.json({ error: 'Files must be 25 MB or smaller' }, { status: 413 });
  }

  let uploadedObject: { bucket: string; key: string } | null = null;
  try {
    const formData = await request.formData();
    const fileValue = formData.get('file');
    if (!(fileValue instanceof File)) {
      return NextResponse.json({ error: 'A file is required' }, { status: 400 });
    }
    if (fileValue.size === 0) {
      return NextResponse.json({ error: 'The file is empty' }, { status: 400 });
    }
    if (fileValue.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Files must be 25 MB or smaller' }, { status: 413 });
    }
    if (fileValue.name.length > 500) {
      return NextResponse.json({ error: 'The file name is too long' }, { status: 400 });
    }

    let metadataInput: unknown = {};
    const metadataValue = formData.get('metadata');
    if (typeof metadataValue === 'string' && metadataValue.trim()) {
      try {
        metadataInput = JSON.parse(metadataValue);
      } catch {
        return NextResponse.json({ error: 'Metadata must be valid JSON' }, { status: 400 });
      }
    }
    const parsedMetadata = metadataSchema.safeParse(metadataInput);
    if (!parsedMetadata.success) {
      return NextResponse.json(
        { error: 'Invalid metadata', message: parsedMetadata.error.issues[0]?.message },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await fileValue.arrayBuffer());
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const bucket = await ensureDocumentBucket();
    const key = `documents/${user.id}/${randomUUID()}`;
    await getS3Client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: fileValue.type || 'application/octet-stream',
      Metadata: {
        'original-name': encodeURIComponent(fileValue.name),
        'sha256': contentHash,
      },
    }));
    uploadedObject = { bucket, key };

    const metadata = {
      ...parsedMetadata.data.metadata,
      originalName: fileValue.name,
      sha256: contentHash,
    };
    const result = await getPool().query(
      `INSERT INTO documents (
         title, content, content_type, owner_id, encrypted, file_size,
         mime_type, storage_key, content_hash, metadata, tags, status, version
       ) VALUES ($1, '', $2, $3, false, $4, $5, $6, $7, $8, $9, $10, 1)
       RETURNING id, title, content, content_type, owner_id, encrypted, file_url,
                 file_size, mime_type, storage_key, content_hash, metadata, tags,
                 status, version, created_at, updated_at`,
      [
        parsedMetadata.data.title || fileValue.name,
        fileValue.type || 'application/octet-stream',
        user.id,
        fileValue.size,
        fileValue.type || 'application/octet-stream',
        key,
        contentHash,
        metadata,
        parsedMetadata.data.tags,
        parsedMetadata.data.status,
      ],
    );
    await logDocumentEvent(AUDIT_ACTIONS.DOCUMENT_CREATE, user.id, result.rows[0].id, request, {
      kind: 'file',
      size: fileValue.size,
      sha256: contentHash,
    });
    return NextResponse.json(mapDocumentRow(result.rows[0]), { status: 201 });
  } catch (error) {
    if (uploadedObject) {
      await getS3Client().send(new DeleteObjectCommand({
        Bucket: uploadedObject.bucket,
        Key: uploadedObject.key,
      })).catch(() => undefined);
    }
    console.error('Document upload failed:', error);
    return NextResponse.json(
      { error: 'Upload failed', message: 'Unable to store the document' },
      { status: 500 },
    );
  }
}
