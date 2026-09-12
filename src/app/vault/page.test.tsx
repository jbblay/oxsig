import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readVaultEditRecovery,
  vaultEditRecoveryStorageKey,
  writeVaultEditRecovery,
} from '@/lib/vault/recovery';
import type { VaultItem } from '@/lib/vault/types';

const mocks = vi.hoisted(() => ({
  listVaultItems: vi.fn(),
  createVaultItem: vi.fn(),
  updateVaultItem: vi.fn(),
  deleteVaultItem: vi.fn(),
  push: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  sessionIdentityId: 'account-a' as string | null,
  isLoading: false,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/auth/use-auth', () => ({
  useAuth: () => ({
    sessionIdentityId: authState.sessionIdentityId,
    isLoading: authState.isLoading,
  }),
}));
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

function recoveryEditor(item: VaultItem, title = 'Recovered title') {
  return {
    kind: item.kind,
    title,
    summary: 'Recovered summary',
    body: 'echo recovered',
    language: 'bash',
    tags: 'linux, recovery',
  } as const;
}

describe('VaultPage usability guards and edit recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    authState.sessionIdentityId = 'account-a';
    authState.isLoading = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a retryable load failure instead of an empty Vault state', async () => {
    mocks.listVaultItems.mockRejectedValueOnce(new Error('Vault service unavailable'));

    render(<VaultPage />);

    await waitFor(() => expect(screen.getByText(/could not load vault/i)).toBeInTheDocument());
    expect(screen.getByText(/vault service unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/^no items$/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^retry$/i })).toBeInTheDocument();
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
    expect(screen.getByText(/^unsaved$/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /beta command/i }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Title')).toHaveValue('Edited alpha command');
  });

  it('restores the exact unsaved edit after the Vault route unmounts and returns', async () => {
    const item = vaultItem('11111111-1111-4111-8111-111111111111', 'Alpha command');
    mocks.listVaultItems.mockResolvedValue([item]);

    const firstRender = render(<VaultPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /alpha command/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /alpha command/i }));

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'script' } });
    fireEvent.change(screen.getByLabelText('Environment'), { target: { value: 'python' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Recovered title' } });
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Recovered summary' } });
    fireEvent.change(screen.getByLabelText('Script and usage notes'), { target: { value: 'print("recovered")' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'python, recovery' } });

    await waitFor(() => {
      expect(window.localStorage.getItem(vaultEditRecoveryStorageKey('account-a'))).not.toBeNull();
    });

    firstRender.unmount();
    render(<VaultPage />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Recovered title'));
    expect(screen.getByLabelText('Type')).toHaveValue('script');
    expect(screen.getByLabelText('Environment')).toHaveValue('python');
    expect(screen.getByLabelText('Summary')).toHaveValue('Recovered summary');
    expect(screen.getByLabelText('Script and usage notes')).toHaveValue('print("recovered")');
    expect(screen.getByLabelText('Tags')).toHaveValue('python, recovery');
    expect(screen.getByText(/^unsaved$/i)).toBeInTheDocument();
  });

  it('clears recovery after a successful save', async () => {
    const item = vaultItem('11111111-1111-4111-8111-111111111111', 'Alpha command');
    mocks.listVaultItems.mockResolvedValue([item]);
    mocks.updateVaultItem.mockResolvedValue({
      ...item,
      title: 'Saved alpha command',
      updatedAt: '2026-09-06T11:00:00.000Z',
    });

    render(<VaultPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /alpha command/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /alpha command/i }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Saved alpha command' } });

    await waitFor(() => {
      expect(window.localStorage.getItem(vaultEditRecoveryStorageKey('account-a'))).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(mocks.updateVaultItem).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(vaultEditRecoveryStorageKey('account-a'))).toBeNull();
  });

  it('clears recovery when the user explicitly discards the edit', async () => {
    const item = vaultItem('11111111-1111-4111-8111-111111111111', 'Alpha command');
    mocks.listVaultItems.mockResolvedValue([item]);

    render(<VaultPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /alpha command/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /alpha command/i }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Discard me' } });

    await waitFor(() => {
      expect(window.localStorage.getItem(vaultEditRecoveryStorageKey('account-a'))).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }));

    expect(screen.getByLabelText('Title')).toHaveValue('Alpha command');
    expect(window.localStorage.getItem(vaultEditRecoveryStorageKey('account-a'))).toBeNull();
  });

  it('never restores account A recovery into account B', async () => {
    const item = vaultItem('11111111-1111-4111-8111-111111111111', 'Alpha command');
    writeVaultEditRecovery('account-a', {
      itemId: item.id,
      baseUpdatedAt: item.updatedAt,
      editor: recoveryEditor(item),
    });
    authState.sessionIdentityId = 'account-b';
    mocks.listVaultItems.mockResolvedValue([item]);

    render(<VaultPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /alpha command/i })).toBeInTheDocument());
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(readVaultEditRecovery('account-a')).not.toBeNull();
    expect(readVaultEditRecovery('account-b')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /alpha command/i }));
    expect(screen.getByLabelText('Title')).toHaveValue('Alpha command');
  });

  it('does not persist account A editor state into account B when identity changes', async () => {
    const accountAItem = vaultItem('11111111-1111-4111-8111-111111111111', 'Alpha command');
    const accountBItem = vaultItem('22222222-2222-4222-8222-222222222222', 'Beta command');
    mocks.listVaultItems
      .mockResolvedValueOnce([accountAItem])
      .mockResolvedValueOnce([accountBItem]);

    const view = render(<VaultPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /alpha command/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /alpha command/i }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Account A draft' } });
    await waitFor(() => expect(readVaultEditRecovery('account-a')).not.toBeNull());

    authState.sessionIdentityId = 'account-b';
    view.rerender(<VaultPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /beta command/i })).toBeInTheDocument());
    expect(readVaultEditRecovery('account-a')?.editor.title).toBe('Account A draft');
    expect(readVaultEditRecovery('account-b')).toBeNull();
    expect(screen.queryByDisplayValue('Account A draft')).not.toBeInTheDocument();
  });

  it('requires an explicit decision before restoring over a newer saved server version', async () => {
    const oldItem = vaultItem('11111111-1111-4111-8111-111111111111', 'Alpha command');
    const newerItem = {
      ...oldItem,
      title: 'Newer server title',
      body: 'echo newer-server-version',
      updatedAt: '2026-09-06T12:00:00.000Z',
    };
    writeVaultEditRecovery('account-a', {
      itemId: oldItem.id,
      baseUpdatedAt: oldItem.updatedAt,
      editor: recoveryEditor(oldItem, 'Older recovered title'),
    });
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmMock);
    mocks.listVaultItems.mockResolvedValue([newerItem]);

    render(<VaultPage />);

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(confirmMock.mock.calls[0]?.[0]).toMatch(/newer saved version/i);
    expect(screen.getByRole('button', { name: /newer server title/i })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Older recovered title')).not.toBeInTheDocument();
    expect(readVaultEditRecovery('account-a')).toBeNull();
  });
});
