import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultItem } from '@/lib/vault/types';

const mocks = vi.hoisted(() => ({
  listVaultItems: vi.fn(),
  createVaultItem: vi.fn(),
  updateVaultItem: vi.fn(),
  deleteVaultItem: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/vault/api', () => ({
  listVaultItems: mocks.listVaultItems,
  createVaultItem: mocks.createVaultItem,
  updateVaultItem: mocks.updateVaultItem,
  deleteVaultItem: mocks.deleteVaultItem,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import VaultPage from './page';

function vaultItem(id: string, title: string): VaultItem {
  return {
    id,
    kind: 'command',
    title,
    summary: `${title} summary`,
    body: `echo ${title.toLowerCase()}`,
    language: 'bash',
    tags: ['linux'],
    pinned: false,
    archived: false,
    sourceType: 'manual',
    sourceId: null,
    metadata: {},
    createdAt: '2026-09-06T10:00:00.000Z',
    updatedAt: '2026-09-06T10:00:00.000Z',
  };
}

describe('VaultPage usability guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a retryable load failure instead of an empty Vault state', async () => {
    mocks.listVaultItems.mockRejectedValueOnce(new Error('Vault service unavailable'));

    render(<VaultPage />);

    await waitFor(() => expect(screen.getByText(/your vault could not be loaded/i)).toBeInTheDocument());
    expect(screen.getByText(/vault service unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/your vault starts with one useful thing/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('does not discard edited knowledge when another item is selected without confirmation', async () => {
    mocks.listVaultItems.mockResolvedValue([
      vaultItem('11111111-1111-4111-8111-111111111111', 'Alpha command'),
      vaultItem('22222222-2222-4222-8222-222222222222', 'Beta command'),
    ]);
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmMock);

    render(<VaultPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /alpha command/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /alpha command/i }));

    const title = screen.getByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Edited alpha command' } });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /beta command/i }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Title')).toHaveValue('Edited alpha command');

    vi.unstubAllGlobals();
  });
});
