import type { VaultItem } from './types';

export function optimisticTogglePinned(item: VaultItem): VaultItem {
  return { ...item, pinned: !item.pinned };
}

export function replaceVaultItem(items: VaultItem[], replacement: VaultItem): VaultItem[] {
  return items.map((item) => item.id === replacement.id ? replacement : item);
}
