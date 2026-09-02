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

const MAX_FILES = 20;
const MAX_UPLOAD_BYTES = Number(
  process.env.STORAGE_MAX_SERVER_UPLOAD_BYTES || 100 * 1024 * 1024
);
const MAX_BATCH_BYTES = Number(
  process.env.STORAGE_MAX_SERVER_BATCH_BYTES || 250 * 1024 * 1024
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
      const formData = await req.formData();
      const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);
      const optionsStr = formData.get('options');

      if (files.length === 0) {
        return NextResponse.json({ error: 'No files provided' }, { status: 400 });
      }

      if (files.length > MAX_FILES) {
        return NextResponse.json(
          { error: `A maximum of ${MAX_FILES} files can be uploaded at once` },
          { status: 400 }
        );
      }

      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      if (
        files.some((file) => file.size <= 0 || file.size > MAX_UPLOAD_BYTES) ||
        totalSize > MAX_BATCH_BYTES
      ) {
        return NextResponse.json(
          { error: 'Upload exceeds the configured server-side size limit' },
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

      const bucket = getStorageBucket();
      const results = [];

      for (const file of files) {
        const filename = sanitizeStorageFilename(file.name || 'file');
        const key = toUserStorageKey(user.id, `uploads/${uuidv4()}-${filename}`);
        const contentType =
          typeof options.contentType === 'string' && options.contentType
            ? options.contentType
            : file.type || 'application/octet-stream';

        await getStorageClient().send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: Buffer.from(await file.arrayBuffer()),
            ContentType: contentType,
            Metadata: {
              originalname: filename,
              uploadedby: user.id,
              uploadedat: new Date().toISOString(),
            },
          })
        );

        results.push({
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
        });
      }

      return NextResponse.json(results, { status: 201 });
    } catch (error) {
      console.error('Storage batch upload error:', error);
      const failure = storageErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  });
}
