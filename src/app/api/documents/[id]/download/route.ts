import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth/middleware';
import { AUDIT_ACTIONS, logDocumentEvent } from '@/lib/audit/logger';
import { getPool } from '@/lib/db/pool';
import { uuidSchema } from '@/lib/http/schemas';
import { getS3Client } from '@/lib/storage/s3-server';
import { getDocumentObjectLocation } from '@/lib/storage/document-location';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'demo') {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  try {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }
    const result = await getPool().query(
      `SELECT storage_key, file_url, mime_type, title
       FROM documents
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [id, user.id],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const document = result.rows[0];
    const location = getDocumentObjectLocation(document.storage_key, document.file_url);
    if (!location) {
      return NextResponse.json({ error: 'Document has no stored file' }, { status: 404 });
    }

    const object = await getS3Client().send(new GetObjectCommand({
      Bucket: location.bucket,
      Key: location.key,
    }));
    if (!object.Body) {
      return NextResponse.json({ error: 'Stored file not found' }, { status: 404 });
    }

    const bytes = await object.Body.transformToByteArray();
    const safeName = String(document.title).replace(/[\r\n"\\]/g, '_');
    await logDocumentEvent(AUDIT_ACTIONS.DOCUMENT_DOWNLOAD, user.id, id, request);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': document.mime_type || object.ContentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Document download failed:', error);
    return NextResponse.json({ error: 'Failed to download document' }, { status: 500 });
  }
}
