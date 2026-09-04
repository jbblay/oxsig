import { NextRequest, NextResponse } from 'next/server';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  getStorageBucket,
  getStorageClient,
  sanitizeStorageFilename,
  storageDownloadPath,
  storageErrorResponse,
  toUserStorageKey,
} from '@/lib/storage/server';

const configuredMaxUpload = Number(
  process.env.STORAGE_MAX_UPLOAD_BYTES ||
  process.env.STORAGE_MAX_SERVER_UPLOAD_BYTES ||
  100 * 1024 * 1024
);
const MAX_UPLOAD_BYTES = Number.isFinite(configuredMaxUpload) && configuredMaxUpload > 0
  ? Math.trunc(configuredMaxUpload)
  : 100 * 1024 * 1024;
const PRESIGN_TTL_SECONDS = 5 * 60;

const uploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  contentType: z.string().trim().min(1).max(200).optional(),
}).strict();

function normalizeContentType(value?: string): string {
  const contentType = value || 'application/octet-stream';
  if (/[\r\n\0]/.test(contentType)) throw new Error('INVALID_CONTENT_TYPE');
  return contentType;
}

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json(
        { error: 'Invalid or missing CSRF token' },
        { status: 403 }
      );
    }

    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 20, windowMs: 10 * 60_000 },
      user.id
    );
    if (rateLimit) return rateLimit;

    try {
      const parsed = uploadSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json(
          { error: `File must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes` },
          { status: 400 }
        );
      }

      const filename = sanitizeStorageFilename(parsed.data.filename);
      const contentType = normalizeContentType(parsed.data.contentType);
      const key = toUserStorageKey(user.id, `uploads/${uuidv4()}-${filename}`);
      const bucket = getStorageBucket();

      const upload = await createPresignedPost(getStorageClient(), {
        Bucket: bucket,
        Key: key,
        Expires: PRESIGN_TTL_SECONDS,
        Fields: {
          'Content-Type': contentType,
        },
        Conditions: [
          ['content-length-range', 1, MAX_UPLOAD_BYTES],
          ['eq', '$Content-Type', contentType],
        ],
      });

      return NextResponse.json({
        upload: {
          url: upload.url,
          fields: upload.fields,
          expiresIn: PRESIGN_TTL_SECONDS,
        },
        object: {
          id: key,
          key,
          bucket,
          filename,
          size: parsed.data.size,
          mimeType: contentType,
          url: storageDownloadPath(key),
          uploadedBy: user.id,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_CONTENT_TYPE') {
        return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
      }
      console.error('Storage upload presign error:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
