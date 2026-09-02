import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '@/lib/auth/middleware';
import { validateCsrfToken } from '@/lib/security/csrf';
import {
  getStorageBucket,
  getStorageClient,
  sanitizeStorageFilename,
  storageDownloadPath,
  storageErrorResponse,
  toUserStorageKey,
} from '@/lib/storage/server';

const MAX_UPLOAD_BYTES = Number(
  process.env.STORAGE_MAX_SERVER_UPLOAD_BYTES || 100 * 1024 * 1024
);

export async function POST(request: NextRequest) {
  return requireAuth(request, async (req, user) => {
    if (!(await validateCsrfToken(req))) {
      return NextResponse.json(
        { error: 'Invalid or missing CSRF token' },
        { status: 403 }
      );
    }

    try {
      // NextRequest is a Web Request at runtime, but this project's Next.js
      // type surface does not currently expose formData() on NextRequest.
      const formData = await (req as Request).formData();
      const file = formData.get('file');
      const optionsStr = formData.get('options');

      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: `File size must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes` },
          { status: 400 }
        );
      }

      let options: Record<string, unknown> = {};
      if (typeof optionsStr === 'string' && optionsStr) {
        const parsed = JSON.parse(optionsStr);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          options = parsed as Record<string, unknown>;
        }
      }

      const requestedName =
        typeof options.filename === 'string' ? options.filename : file.name;
      const filename = sanitizeStorageFilename(requestedName || 'file');
      const key = toUserStorageKey(user.id, `uploads/${uuidv4()}-${filename}`);
      const bucket = getStorageBucket();
      const contentType =
        typeof options.contentType === 'string' && options.contentType
          ? options.contentType
          : file.type || 'application/octet-stream';

      const buffer = Buffer.from(await file.arrayBuffer());

      await getStorageClient().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          Metadata: {
            originalname: filename,
            uploadedby: user.id,
            uploadedat: new Date().toISOString(),
          },
        })
      );

      return NextResponse.json(
        {
          id: key,
          key,
          bucket,
          filename,
          size: file.size,
          mimeType: contentType,
          url: storageDownloadPath(key),
          metadata:
            options.metadata && typeof options.metadata === 'object'
              ? options.metadata
              : {},
          encrypted: Boolean(options.encrypted),
          checksum: '',
          uploadedBy: user.id,
          createdAt: new Date().toISOString(),
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Storage upload error:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
