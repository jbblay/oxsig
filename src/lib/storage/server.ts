import 'server-only';

import { S3Client } from '@aws-sdk/client-s3';

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
  const bucket = process.env.STORAGE_BUCKET;
  if (!bucket) throw new StorageConfigurationError('STORAGE_BUCKET is required.');
  return bucket;
}

export function getStorageClient(): S3Client {
  if (!storageClient) {
    storageClient = new S3Client({
      region: process.env.STORAGE_REGION || process.env.AWS_REGION || 'eu-central-1',
    });
  }
  return storageClient;
}

export function getUserStoragePrefix(userId: string): string {
  if (!userId || /[\r\n]/.test(userId)) throw new StorageAccessError('Invalid authenticated user identifier');
  return `${userId}/`;
}

function normalizeKey(key: string): string {
  const normalized = key.trim().replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0') || normalized.split('/').some((part) => part === '..')) {
    throw new StorageAccessError('Invalid storage object key');
  }
  return normalized;
}

export function assertUserStorageKey(userId: string, key: string): string {
  const normalized = normalizeKey(key);
  if (!normalized.startsWith(getUserStoragePrefix(userId))) throw new StorageAccessError();
  return normalized;
}

export function toUserStorageKey(userId: string, key: string): string {
  const normalized = normalizeKey(key);
  const prefix = getUserStoragePrefix(userId);
  return normalized.startsWith(prefix) ? normalized : `${prefix}${normalized}`;
}

export function sanitizeStorageFilename(filename: string): string {
  const safe = filename.trim().replace(/[\\/]/g, '_').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180);
  return safe || 'file';
}

export function storageDownloadPath(key: string): string {
  return `/api/storage/download?key=${encodeURIComponent(key)}`;
}

export function storageErrorResponse(error: unknown): { status: number; body: { error: string } } {
  if (error instanceof StorageAccessError) return { status: 403, body: { error: error.message } };
  if (error instanceof StorageConfigurationError) return { status: 503, body: { error: error.message } };
  return { status: 500, body: { error: 'Storage operation failed' } };
}
