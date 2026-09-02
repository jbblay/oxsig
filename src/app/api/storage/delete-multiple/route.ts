import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import {
  assertUserStorageKey,
  getStorageBucket,
  getStorageClient,
  storageErrorResponse,
} from '@/lib/storage/server';

const MAX_DELETE_KEYS = 100;

export async function DELETE(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json(
        { error: 'Invalid or missing CSRF token' },
        { status: 403 }
      );
    }

    try {
      const body = await req.json().catch(() => null);
      const rawKeys = body?.keys;

      if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
        return NextResponse.json({ error: 'No keys provided' }, { status: 400 });
      }

      if (rawKeys.length > MAX_DELETE_KEYS || rawKeys.some((key) => typeof key !== 'string')) {
        return NextResponse.json(
          { error: `Provide between 1 and ${MAX_DELETE_KEYS} valid object keys` },
          { status: 400 }
        );
      }

      const keys = rawKeys.map((key) => assertUserStorageKey(user.id, key));
      const bucket = getStorageBucket();

      await getStorageClient().send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        })
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Storage delete-multiple error:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
