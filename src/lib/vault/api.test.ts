import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/security/csrf-client', () => ({ getCsrfToken: async () => 'csrf-token' }));

import { updateVaultItem, VaultConflictError, vaultErrorMessage } from './api';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('Vault client updates', () => {
  it('sends the caller-supplied expected version with CSRF protection', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { item: { id: 'item-1', version: 5 } }));

    const updated = await updateVaultItem('item-1', { title: 'Edited' }, 4);

    expect(updated).toEqual({ id: 'item-1', version: 5 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/vault/item-1');
    expect(init.method).toBe('PATCH');
    expect(init.headers['x-csrf-token']).toBe('csrf-token');
    expect(JSON.parse(init.body)).toEqual({ title: 'Edited', version: 4 });
  });

  it('works for items that were never listed in this browser session', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { item: { id: 'unlisted', version: 2 } }));
    await expect(updateVaultItem('unlisted', { pinned: true }, 1)).resolves.toMatchObject({ version: 2 });
  });

  it('refuses to send an update without a valid expected version', async () => {
    await expect(updateVaultItem('item-1', { title: 'x' }, 0)).rejects.toThrow(/version is unavailable/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the latest server copy on a 409 version conflict', async () => {
    const current = { id: 'item-1', version: 9, title: 'Newer' };
    fetchMock.mockResolvedValue(jsonResponse(409, { error: 'Changed elsewhere', code: 'VAULT_VERSION_CONFLICT', current }));

    const error = await updateVaultItem('item-1', { title: 'Mine' }, 8).catch((caught) => caught);

    expect(error).toBeInstanceOf(VaultConflictError);
    expect(error.current).toEqual(current);
    expect(error.message).toBe('Changed elsewhere');
  });

  it('includes the first field-level validation error in the message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, {
      error: 'Invalid Vault update',
      details: { fieldErrors: { tags: ['String must contain at most 40 character(s)'] } },
    }));

    await expect(updateVaultItem('item-1', { tags: ['x'.repeat(41)] }, 1))
      .rejects.toThrow('Invalid Vault update (tags: String must contain at most 40 character(s))');
  });
});

describe('vaultErrorMessage', () => {
  it('falls back when the payload has no error text', () => {
    expect(vaultErrorMessage({}, 'Fallback')).toBe('Fallback');
  });
});
