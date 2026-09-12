import { VAULT_KINDS, type VaultKind } from './types';

export const VAULT_EDIT_RECOVERY_PREFIX = 'oxsig:vault-edit-recovery:v1:';

export type VaultEditRecoveryEditor = {
  kind: VaultKind;
  title: string;
  summary: string;
  body: string;
  language: string;
  tags: string;
};

export type VaultEditRecoveryDraft = {
  version: 1;
  accountId: string;
  itemId: string;
  baseUpdatedAt: string;
  editor: VaultEditRecoveryEditor;
  savedAt: number;
};

type RecoveryInput = Pick<VaultEditRecoveryDraft, 'itemId' | 'baseUpdatedAt' | 'editor'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEditor(value: unknown): value is VaultEditRecoveryEditor {
  if (!isRecord(value)) return false;
  return (
    VAULT_KINDS.includes(value.kind as VaultKind) &&
    typeof value.title === 'string' &&
    typeof value.summary === 'string' &&
    typeof value.body === 'string' &&
    typeof value.language === 'string' &&
    typeof value.tags === 'string'
  );
}

function resolveStorage(storage?: Storage) {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function vaultEditRecoveryStorageKey(accountId: string) {
  return `${VAULT_EDIT_RECOVERY_PREFIX}${encodeURIComponent(accountId)}`;
}

export function readVaultEditRecovery(accountId: string, storage?: Storage): VaultEditRecoveryDraft | null {
  const target = resolveStorage(storage);
  if (!target) return null;

  try {
    const raw = target.getItem(vaultEditRecoveryStorageKey(accountId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (
      parsed.version !== 1 ||
      parsed.accountId !== accountId ||
      typeof parsed.itemId !== 'string' ||
      !parsed.itemId ||
      typeof parsed.baseUpdatedAt !== 'string' ||
      !parsed.baseUpdatedAt ||
      typeof parsed.savedAt !== 'number' ||
      !Number.isFinite(parsed.savedAt) ||
      !isEditor(parsed.editor)
    ) {
      return null;
    }
    return parsed as VaultEditRecoveryDraft;
  } catch {
    return null;
  }
}

export function writeVaultEditRecovery(accountId: string, input: RecoveryInput, storage?: Storage) {
  const target = resolveStorage(storage);
  if (!target) return null;

  const draft: VaultEditRecoveryDraft = {
    version: 1,
    accountId,
    itemId: input.itemId,
    baseUpdatedAt: input.baseUpdatedAt,
    editor: input.editor,
    savedAt: Date.now(),
  };

  try {
    target.setItem(vaultEditRecoveryStorageKey(accountId), JSON.stringify(draft));
    return draft;
  } catch {
    return null;
  }
}

export function clearVaultEditRecovery(accountId: string, storage?: Storage) {
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    target.removeItem(vaultEditRecoveryStorageKey(accountId));
  } catch {
    // Recovery must never block normal Vault editing when browser storage is unavailable.
  }
}
