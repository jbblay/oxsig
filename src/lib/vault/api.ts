import type { VaultItem, VaultItemInput } from './types';

async function csrfToken() {
  const response = await fetch('/api/csrf-token', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not prepare secure request');
  const data = await response.json();
  return data.token as string;
}

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}));
  return new Error(typeof data?.error === 'string' ? data.error : fallback);
}

export async function listVaultItems(): Promise<VaultItem[]> {
  const response = await fetch('/api/vault', { cache: 'no-store' });
  if (!response.ok) throw await responseError(response, 'Vault could not be loaded');
  const data = await response.json();
  return Array.isArray(data.items) ? data.items : [];
}

export async function createVaultItem(input: VaultItemInput): Promise<VaultItem> {
  const response = await fetch('/api/vault', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': await csrfToken(),
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await responseError(response, 'Vault item could not be created');
  return (await response.json()).item as VaultItem;
}

export async function updateVaultItem(
  id: string,
  patch: Partial<VaultItemInput> & { archived?: boolean }
): Promise<VaultItem> {
  const response = await fetch(`/api/vault/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': await csrfToken(),
    },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw await responseError(response, 'Vault item could not be updated');
  return (await response.json()).item as VaultItem;
}

export async function deleteVaultItem(id: string): Promise<void> {
  const response = await fetch(`/api/vault/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-csrf-token': await csrfToken() },
  });
  if (!response.ok) throw await responseError(response, 'Vault item could not be deleted');
}
