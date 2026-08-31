import { getDocumentBucket } from './s3-server';

export function getDocumentObjectLocation(
  storageKey: string | null,
  legacyFileUrl: string | null,
): { bucket: string; key: string } | null {
  if (storageKey) return { bucket: getDocumentBucket(), key: storageKey };
  if (!legacyFileUrl) return null;

  try {
    const url = new URL(legacyFileUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { bucket: parts[0], key: parts.slice(1).join('/') };
  } catch {
    return null;
  }
}
