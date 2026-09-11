import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { getPool } from '@/lib/db/pool';
import {
  assertCollaborationObjectKey,
  collaborationObjectPrefix,
  getCollaborationAccess,
} from '@/lib/collab/server';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  getStorageBucket,
  getStorageClient,
  sanitizeStorageFilename,
  storageErrorResponse,
} from '@/lib/storage/server';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();
const configuredMax = Number(process.env.COLLAB_MAX_ATTACHMENT_BYTES || 30 * 1024 * 1024);
const MAX_ATTACHMENT_BYTES = Number.isFinite(configuredMax) && configuredMax > 0
  ? Math.trunc(configuredMax)
  : 30 * 1024 * 1024;
const UPLOAD_TTL_SECONDS = 5 * 60;
const DOWNLOAD_TTL_SECONDS = 60;

const uploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  contentType: z.string().trim().min(1).max(200).optional(),
}).strict();

function normalizedContentType(value?: string): string {
  const type = value || 'application/octet-stream';
  if (/[\r\n\0]/.test(type)) throw new Error('INVALID_CONTENT_TYPE');
  return type;
}

function displayFilename(key: string): string {
  const raw = key.split('/').pop() || 'attachment';
  return raw.replace(/^[0-9a-f-]{36}-/i, '') || 'attachment';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    }

    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 30, windowMs: 10 * 60_000 },
      `${user.id}:${id}`
    );
    if (rateLimit) return rateLimit;

    const parsed = uploadSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Attachment must be between 1 byte and ${MAX_ATTACHMENT_BYTES} bytes` },
        { status: 400 }
      );
    }

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) {
      return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
    }

    try {
      const filename = sanitizeStorageFilename(parsed.data.filename);
      const contentType = normalizedContentType(parsed.data.contentType);
      const key = `${collaborationObjectPrefix(id)}${uuidv4()}-${filename}`;
      const bucket = getStorageBucket();
      const upload = await createPresignedPost(getStorageClient(), {
        Bucket: bucket,
        Key: key,
        Expires: UPLOAD_TTL_SECONDS,
        Fields: { 'Content-Type': contentType },
        Conditions: [
          ['content-length-range', 1, MAX_ATTACHMENT_BYTES],
          ['eq', '$Content-Type', contentType],
        ],
      });

      return NextResponse.json({
        upload: {
          url: upload.url,
          fields: upload.fields,
          expiresIn: UPLOAD_TTL_SECONDS,
        },
        object: {
          key,
          filename,
          size: parsed.data.size,
          mimeType: contentType,
          uploadedBy: user.id,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_CONTENT_TYPE') {
        return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
      }
      console.error('Collaboration attachment upload failed:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req, user) => {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid collaboration session' }, { status: 400 });
    }

    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 90, windowMs: 60_000 },
      `${user.id}:${id}`
    );
    if (rateLimit) return rateLimit;

    const pool = getPool();
    const access = await getCollaborationAccess(pool, id, user.id);
    if (!access) {
      return NextResponse.json({ error: 'Collaboration not found or access denied' }, { status: 404 });
    }

    try {
      const url = new URL(req.url);
      const rawKey = url.searchParams.get('key');
      if (!rawKey) return NextResponse.json({ error: 'Missing attachment key' }, { status: 400 });
      const key = assertCollaborationObjectKey(id, rawKey);

      if (url.searchParams.get('verify') === '1') {
        await getStorageClient().send(new HeadObjectCommand({
          Bucket: getStorageBucket(),
          Key: key,
        }));
        return NextResponse.json({ ready: true }, { headers: { 'Cache-Control': 'no-store' } });
      }

      const filename = sanitizeStorageFilename(displayFilename(key));
      const asDownload = url.searchParams.get('download') === '1';
      const disposition = `${asDownload ? 'attachment' : 'inline'}; filename="${filename}"`;

      const signedUrl = await getSignedUrl(
        getStorageClient(),
        new GetObjectCommand({
          Bucket: getStorageBucket(),
          Key: key,
          ResponseContentDisposition: disposition,
          ResponseCacheControl: 'private, no-store',
        }),
        { expiresIn: DOWNLOAD_TTL_SECONDS }
      );

      return NextResponse.redirect(signedUrl, 302);
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_COLLABORATION_OBJECT_KEY') {
        return NextResponse.json({ error: 'Attachment does not belong to this session' }, { status: 403 });
      }
      console.error('Collaboration attachment download failed:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
