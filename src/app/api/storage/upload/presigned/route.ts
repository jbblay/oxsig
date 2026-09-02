import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import {
  getStorageBucket,
  getStorageClient,
  sanitizeStorageFilename,
  storageErrorResponse,
  toUserStorageKey,
} from '@/lib/storage/server';

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
const EXPIRES_IN = 15 * 60;

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json(
        { error: 'Invalid or missing CSRF token' },
        { status: 403 }
      );
    }

    try {
      const body = await req.json().catch(() => null);
      const filename =
        typeof body?.filename === 'string'
          ? sanitizeStorageFilename(body.filename)
          : '';
      const fileSize = Number(body?.fileSize);
      const mimeType =
        typeof body?.mimeType === 'string' && body.mimeType
          ? body.mimeType
          : 'application/octet-stream';

      if (!filename || !Number.isFinite(fileSize)) {
        return NextResponse.json(
          { error: 'Filename and fileSize are required' },
          { status: 400 }
        );
      }

      if (fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'File size must be between 1 byte and 5GB' },
          { status: 400 }
        );
      }

      const uploadId = randomBytes(16).toString('hex');
      const objectKey = toUserStorageKey(
        user.id,
        `uploads/${Date.now()}-${uploadId}-${filename}`
      );
      const bucketName = getStorageBucket();

      const uploadUrl = await getSignedUrl(
        getStorageClient(),
        new PutObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
          ContentType: mimeType,
          Metadata: {
            originalname: filename,
            uploadedby: user.id,
          },
        }),
        { expiresIn: EXPIRES_IN }
      );

      return NextResponse.json({
        uploadUrl,
        objectKey,
        bucketName,
        expiresIn: EXPIRES_IN,
        maxFileSize: MAX_FILE_SIZE,
        uploadId,
        requiredHeaders: {
          'Content-Type': mimeType,
        },
      });
    } catch (error) {
      console.error('Failed to generate presigned upload URL:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
