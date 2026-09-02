import 'server-only';

import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';

let storageClient: S3Client | null = null;

export class StorageAccessError extends Error {
  constructor(message = 'Storage object is outside the authenticated user namespace') {
    super(message);
    this.name = 'StorageAccessError';
  }
}

export class StorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageConfigurationError';
  }
}

export function getStorageBucket(): string {
  const bucket = process.env.STORAGE_BUCKET || process.env.MINIO_BUCKET;

  if (!bucket) {
    if (process.env.NODE_ENV === 'production') {
      throw new StorageConfigurationError(
        'Storage is not configured. Set STORAGE_BUCKET (preferred) or MINIO_BUCKET.'
      );
    }

    return 'oxsig-documents';
  }

  return bucket;
}

export function getStorageClient(): S3Client {
  if (storageClient) return storageClient;

  const endpoint = process.env.STORAGE_ENDPOINT || process.env.MINIO_ENDPOINT;
  const region =
    process.env.STORAGE_REGION ||
    process.env.MINIO_REGION ||
    process.env.AWS_REGION ||
    'us-east-1';

  const accessKeyId =
    process.env.STORAGE_ACCESS_KEY_ID || process.env.MINIO_ACCESS_KEY;
  const secretAccessKey =
    process.env.STORAGE_SECRET_ACCESS_KEY || process.env.MINIO_SECRET_KEY;

  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw new StorageConfigurationError(
      'Storage credentials are incomplete. Configure both access key ID and secret access key.'
    );
  }

  const config: S3ClientConfig = { region };

  // For AWS S3, omit endpoint/credentials and use the AWS SDK provider chain
  // (for example an IAM role). Endpoint credentials remain available for
  // explicitly configured S3-compatible development services such as MinIO.
  if (endpoint) {
    config.endpoint = endpoint;
    config.forcePathStyle = process.env.STORAGE_FORCE_PATH_STYLE !== 'false';
  }

  if (accessKeyId && secretAccessKey) {
    config.credentials = { accessKeyId, secretAccessKey };
  }

  storageClient = new S3Client(config);
  return storageClient;
}

export function getUserStoragePrefix(userId: string): string {
  if (!userId || /[\r\n]/.test(userId)) {
    throw new StorageAccessError('Invalid authenticated user identifier');
  }

  return `${userId}/`;
}

function normalizeKey(key: string): string {
  const normalized = key.trim().replace(/^\/+/, '');

  if (
    !normalized ||
    normalized.includes('\0') ||
    normalized.split('/').some((part) => part === '..')
  ) {
    throw new StorageAccessError('Invalid storage object key');
  }

  return normalized;
}

export function assertUserStorageKey(userId: string, key: string): string {
  const normalized = normalizeKey(key);
  const prefix = getUserStoragePrefix(userId);

  if (!normalized.startsWith(prefix)) {
    throw new StorageAccessError();
  }

  return normalized;
}

export function toUserStorageKey(userId: string, key: string): string {
  const normalized = normalizeKey(key);
  const prefix = getUserStoragePrefix(userId);

  return normalized.startsWith(prefix) ? normalized : `${prefix}${normalized}`;
}

export function sanitizeStorageFilename(filename: string): string {
  const safe = filename
    .trim()
    .replace(/[\\/]/g, '_')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .slice(0, 180);

  return safe || 'file';
}

export function storageDownloadPath(key: string): string {
  return `/api/storage/download?key=${encodeURIComponent(key)}`;
}

export function storageErrorResponse(error: unknown): {
  status: number;
  body: { error: string };
} {
  if (error instanceof StorageAccessError) {
    return { status: 403, body: { error: error.message } };
  }

  if (error instanceof StorageConfigurationError) {
    return { status: 503, body: { error: error.message } };
  }

  return { status: 500, body: { error: 'Storage operation failed' } };
}
