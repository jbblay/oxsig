import { NextRequest, NextResponse } from 'next/server';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  assertStoryboardUploadKey,
  createStoryboardAudioKey,
  deleteStoryboardAudioObject,
  getMaxStoryboardAudioBytes,
} from '@/lib/storyboards/audio-storage';
import { ALLOWED_STORYBOARD_AUDIO_TYPES } from '@/lib/storyboards/validation';
import {
  getStorageBucket,
  getStorageClient,
  sanitizeStorageFilename,
  storageErrorResponse,
} from '@/lib/storage/server';

export const runtime = 'nodejs';

const UPLOAD_TTL_SECONDS = 5 * 60;

const requestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().min(1),
  contentType: z.string().trim().min(1).max(100),
}).strict();

const deleteSchema = z.object({ key: z.string().trim().min(1).max(1024) }).strict();

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 30, windowMs: 10 * 60_000 },
      `${user.id}:storyboard-audio-upload`
    );
    if (rateLimit) return rateLimit;

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid Storyboard audio upload request' }, { status: 400 });
    }

    const maxBytes = getMaxStoryboardAudioBytes();
    if (parsed.data.size > maxBytes) {
      return NextResponse.json({ error: `Storyboard audio exceeds the ${maxBytes}-byte configured limit` }, { status: 413 });
    }
    if (!ALLOWED_STORYBOARD_AUDIO_TYPES.has(parsed.data.contentType)) {
      return NextResponse.json({ error: 'Unsupported audio format' }, { status: 415 });
    }

    try {
      const filename = sanitizeStorageFilename(parsed.data.filename);
      const key = createStoryboardAudioKey(user.id, filename);
      const upload = await createPresignedPost(getStorageClient(), {
        Bucket: getStorageBucket(),
        Key: key,
        Expires: UPLOAD_TTL_SECONDS,
        Fields: { 'Content-Type': parsed.data.contentType },
        Conditions: [
          ['content-length-range', 1, maxBytes],
          ['eq', '$Content-Type', parsed.data.contentType],
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
          size: parsed.data.size,
          mimeType: parsed.data.contentType,
        },
      });
    } catch (error) {
      console.error('Storyboard audio presign failed:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}

export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
    }
    const rateLimit = await checkRateLimit(
      req,
      { maxRequests: 30, windowMs: 10 * 60_000 },
      `${user.id}:storyboard-audio-cleanup`
    );
    if (rateLimit) return rateLimit;

    const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid audio object key' }, { status: 400 });

    try {
      const key = assertStoryboardUploadKey(user.id, parsed.data.key);
      await deleteStoryboardAudioObject(key);
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_STORYBOARD_AUDIO_KEY') {
        return NextResponse.json({ error: 'Audio object does not belong to this user upload namespace' }, { status: 403 });
      }
      console.error('Storyboard audio cleanup failed:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
