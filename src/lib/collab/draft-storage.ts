const STORAGE_PREFIX = 'oxsig:collaboration-drafts:v1';

type DraftRecord = Record<string, string>;

export function collaborationDraftStorageKey(accountIdentity: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(accountIdentity)}`;
}

function readDraftRecord(accountIdentity: string): DraftRecord {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(collaborationDraftStorageKey(accountIdentity));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
  } catch {
    return {};
  }
}

export function readCollaborationDraft(accountIdentity: string | null, collaborationId: string | null) {
  if (!accountIdentity || !collaborationId) return '';
  return readDraftRecord(accountIdentity)[collaborationId] || '';
}

export function writeCollaborationDraft(
  accountIdentity: string | null,
  collaborationId: string | null,
  text: string
) {
  if (!accountIdentity || !collaborationId || typeof window === 'undefined') return;

  try {
    const next = readDraftRecord(accountIdentity);
    if (text) next[collaborationId] = text;
    else delete next[collaborationId];

    const key = collaborationDraftStorageKey(accountIdentity);
    if (Object.keys(next).length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Draft persistence must never make the Collaboration composer unusable.
  }
}
