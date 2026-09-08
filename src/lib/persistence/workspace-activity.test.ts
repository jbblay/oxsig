import { beforeEach, describe, expect, it } from 'vitest';
import {
  getWorkspaceActivity,
  getWorkspaceRecents,
  mergeWorkspaceState,
  recordWorkspaceActivity,
} from './workspace-activity';

describe('workspace activity cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('merges durable activity by client event id without duplicates', () => {
    recordWorkspaceActivity({ label: 'Local action', href: '/labs', color: 'labs', kind: 'action' });
    const local = getWorkspaceActivity()[0];

    mergeWorkspaceState({
      activity: [
        local,
        { id: 'remote-1', label: 'Opened Vault', href: '/vault', color: 'vault', kind: 'navigation', at: local.at - 1000 },
      ],
    });

    expect(getWorkspaceActivity().filter((item) => item.id === local.id)).toHaveLength(1);
    expect(getWorkspaceActivity().some((item) => item.id === 'remote-1')).toBe(true);
  });

  it('keeps the newest recent workspace timestamp across devices', () => {
    mergeWorkspaceState({
      recents: [{ href: '/labs', label: 'Cyber Lab', color: 'labs', at: 1000 }],
    });
    mergeWorkspaceState({
      recents: [
        { href: '/labs', label: 'Cyber Lab', color: 'labs', at: 500 },
        { href: '/vault', label: 'Vault', color: 'vault', at: 2000 },
      ],
    });

    expect(getWorkspaceRecents()).toEqual([
      { href: '/vault', label: 'Vault', color: 'vault', at: 2000 },
      { href: '/labs', label: 'Cyber Lab', color: 'labs', at: 1000 },
    ]);
  });
});
