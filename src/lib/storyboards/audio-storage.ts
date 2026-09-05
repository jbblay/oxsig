import 'server-only';

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import {
  getStorageBucket,
  getStorageClient,
  sanitizeStorageFilename,
} from '@/lib/storage/server';
import {
  ALLOWED_STORYBOARD_AUDIO_TYPES,
  DEFAULT_STORYBOARD_AUDIO_BYTES,
  LEGACY_STORYBOARD_AUDIO_BYTES,
  MAX_STORYBOARD_AUDIO_STORAGE_BYTES,
  storyboardAudioReferenceSchema,
  type StoryboardAudioReference,
} from './validation';

export type VerifiedStoryboardAudioReference = StoryboardAudioReference & {
  etag: string | null;
};

export function getMaxStoryboardAudioBytes(): number {
  const configured = Number(process.env.STORYBOARD_MAX_AUDIO_BYTES || DEFAULT_STORYBOARD_AUDIO_BYTES);
  if (!Number.isFinite(configured) || configured < 1) return DEFAULT_STORYBOARD_AUDIO_BYTES;
  return Math.min(Math.trunc(configured), MAX_STORYBOARD_AUDIO_STORAGE_BYTES);
}

export function storyboardAudioPrefix(userId: string): string {
  if (!userId || /[\r\n\0/]/.test(userId)) throw new Error('INVALID_STORYBOARD_AUDIO_OWNER');
  return `storyboards/audio/${userId}/`;
}

export function createStoryboardAudioKey(userId: string, filename: string): string {
  return `${storyboardAudioPrefix(userId)}${uuidv4()}-${sanitizeStorageFilename(filename)}`;
}

export function assertStoryboardUploadKey(userId: string, key: string): string {
  const normalized = key.trim().replace(/^\/+/, '');
  if (
    !normalized ||
    normalized.includes('\0') ||
    normalized.split('/').some((part) => part === '..') ||
    !normalized.startsWith(storyboardAudioPrefix(userId))
  ) {
    throw new Error('INVALID_STORYBOARD_AUDIO_KEY');
  }
  return normalized;
}

function cleanEtag(value?: string): string | null {
  return value ? value.replace(/^"|"$/g, '') : null;
}

export async function verifyStoryboardAudioReference(
  userId: string,
  raw: StoryboardAudioReference
): Promise<VerifiedStoryboardAudioReference> {
  const parsed = storyboardAudioReferenceSchema.safeParse(raw);
  if (!parsed.success) throw new Error('INVALID_STORYBOARD_AUDIO_REFERENCE');
  const reference = parsed.data;
  const maxBytes = getMaxStoryboardAudioBytes();
  if (reference.size > maxBytes) throw new Error('STORYBOARD_AUDIO_TOO_LARGE');
  if (!ALLOWED_STORYBOARD_AUDIO_TYPES.has(reference.mimeType)) {
    throw new Error('STORYBOARD_AUDIO_TYPE');
  }

  const key = assertStoryboardUploadKey(userId, reference.key);
  const head = await getStorageClient().send(new HeadObjectCommand({
    Bucket: getStorageBucket(),
    Key: key,
  }));

  const actualSize = Number(head.ContentLength || 0);
  const actualType = String(head.ContentType || '');
  if (actualSize !== reference.size || actualSize < 1 || actualSize > maxBytes) {
    throw new Error('STORYBOARD_AUDIO_OBJECT_MISMATCH');
  }
  if (actualType !== reference.mimeType || !ALLOWED_STORYBOARD_AUDIO_TYPES.has(actualType)) {
    throw new Error('STORYBOARD_AUDIO_OBJECT_MISMATCH');
  }

  return {
    key,
    size: actualSize,
    mimeType: actualType,
    etag: cleanEtag(head.ETag),
  };
}

export async function uploadLegacyStoryboardAudio(
  userId: string,
  audio: File,
  filename = 'storyboard-audio'
): Promise<VerifiedStoryboardAudioReference> {
  if (audio.size < 1 || audio.size > LEGACY_STORYBOARD_AUDIO_BYTES) {
    throw new Error('LEGACY_STORYBOARD_AUDIO_TOO_LARGE');
  }
  if (!ALLOWED_STORYBOARD_AUDIO_TYPES.has(audio.type)) {
    throw new Error('STORYBOARD_AUDIO_TYPE');
  }

  const key = createStoryboardAudioKey(userId, filename);
  const result = await getStorageClient().send(new PutObjectCommand({
    Bucket: getStorageBucket(),
    Key: key,
    Body: Buffer.from(await audio.arrayBuffer()),
    ContentType: audio.type,
    CacheControl: 'private, no-store',
  }));

  return {
    key,
    size: audio.size,
    mimeType: audio.type,
    etag: cleanEtag(result.ETag),
  };
}

export async function deleteStoryboardAudioObject(key?: string | null): Promise<void> {
  if (!key) return;
  await getStorageClient().send(new DeleteObjectCommand({
    Bucket: getStorageBucket(),
    Key: key,
  }));
}
