import { describe, expect, it } from 'vitest';
import { optimisticTogglePinned, replaceVaultItem } from './optimistic';
import type { VaultItem } from './types';

function item(id: string, pinned: boolean): VaultItem {
  return {
    id,
    kind: 'concept',
    title: id,
    summary: '',
    body: '',
    tags: [],
    pinned,
    archived: false,
    metadata: {},
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  };
}

describe('Vault optimistic pin state', () => {
  it('toggles only the pinned field while preserving the item', () => {
    const original = item('one', false);
    const optimistic = optimisticTogglePinned(original);

    expect(optimistic).toEqual({ ...original, pinned: true });
    expect(original.pinned).toBe(false);
  });

  it('replaces the matching item without changing list order', () => {
    const first = item('one', false);
    const second = item('two', false);
    const replacement = { ...second, pinned: true };

    expect(replaceVaultItem([first, second], replacement)).toEqual([first, replacement]);
  });

  it('can restore the exact previous item after a failed mutation', () => {
    const original = item('one', false);
    const optimistic = optimisticTogglePinned(original);

    expect(replaceVaultItem([optimistic], original)).toEqual([original]);
  });
});
