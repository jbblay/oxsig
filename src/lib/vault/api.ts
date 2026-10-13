import { getCsrfToken } from '@/lib/security/csrf-client';
import type { VaultItem, VaultItemInput } from './types';

/**
 * Raised when the server rejects an update because the item changed after the
 * editor loaded it. `current` carries the latest server copy (when the server
 * provides it) so the UI can rebase without a full page reload.
 */
export class VaultConflictError extends Error {
  readonly code = 'VAULT_VERSION_CONFLICT';

  constructor(message: string, readonly current: VaultItem | null) {
    super(message);
    this.name = 'VaultConflictError';
  }
}

type ErrorPayload = {
  error?: unknown;
  details?: { fieldErrors?: Record<string, unknown> };
};

function firstFieldError(payload: ErrorPayload): string | null {
  const fieldErrors = payload?.details?.fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== 'object') return null;
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (Array.isArray(messages) && typeof messages[0] === 'string') return `${field}: ${messages[0]}`;
  }
  return null;
}

export function vaultErrorMessage(payload: ErrorPayload, fallback: string): string {
  const base = typeof payload?.error === 'string' ? payload.error : fallback;
  const field = firstFieldError(payload);
  return field ? `${base} (${field})` : base;
}

async function responseError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => ({}))) as ErrorPayload;
  return new Error(vaultErrorMessage(data, fallback));
}

export async function listVaultItems(): Promise<VaultItem[]> {
  const response = await fetch('/api/vault', { cache: 'no-store' });
  if (!response.ok) throw await responseError(response, 'Vault could not be loaded');
  const data = await response.json();
  return Array.isArray(data.items) ? (data.items as VaultItem[]) : [];
}

export async function createVaultItem(input: VaultItemInput): Promise<VaultItem> {
  const response = await fetch('/api/vault', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': await getCsrfToken(),
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await responseError(response, 'Vault item could not be created');
  return (await response.json()).item as VaultItem;
}

/**
 * Update a Vault item using optimistic concurrency.
 *
 * `expectedVersion` must be the version the caller's copy was derived from.
 * It is passed explicitly (instead of read from hidden module state) so that a
 * stale editor can never be silently saved over a newer server copy.
 */
export async function updateVaultItem(
  id: string,
  patch: Partial<VaultItemInput> & { archived?: boolean },
  expectedVersion: number
): Promise<VaultItem> {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error('Vault item version is unavailable. Refresh the Vault and try again.');
  }

  const response = await fetch(`/api/vault/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': await getCsrfToken(),
    },
    body: JSON.stringify({ ...patch, version: expectedVersion }),
  });

  if (response.status === 409) {
    const data = (await response.json().catch(() => ({}))) as ErrorPayload & { current?: VaultItem };
    throw new VaultConflictError(
      vaultErrorMessage(data, 'Vault item changed since it was loaded.'),
      data.current && typeof data.current === 'object' ? data.current : null
    );
  }
  if (!response.ok) throw await responseError(response, 'Vault item could not be updated');
  return (await response.json()).item as VaultItem;
}

export async function deleteVaultItem(id: string): Promise<void> {
  const response = await fetch(`/api/vault/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-csrf-token': await getCsrfToken() },
  });
  if (!response.ok) throw await responseError(response, 'Vault item could not be deleted');
}
