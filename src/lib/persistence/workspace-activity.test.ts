import { beforeEach, describe, expect, it } from 'vitest';
import {
  getWorkspaceActivity,
  getWorkspaceLocalOwner,
  getWorkspaceRecents,
  mergeWorkspaceState,
  prepareWorkspaceLocalStateForGuest,
  prepareWorkspaceLocalStateForUser,
  recordWorkspaceActivity,
  recordWorkspaceVisit,
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

  it('preserves Operations and WarRoom routes added after the durable branch diverged', () => {
    recordWorkspaceVisit('/operations/black-domain');
    recordWorkspaceVisit('/warroom/session-1');

    expect(getWorkspaceRecents().map((item) => ({ href: item.href, label: item.label, color: item.color }))).toEqual([
      { href: '/warroom', label: 'WarRoom', color: 'live' },
      { href: '/operations', label: 'Operations', color: 'labs' },
    ]);
    expect(getWorkspaceActivity().map((item) => item.label)).toEqual([
      'Opened WarRoom',
      'Opened Operations',
    ]);
  });

  it('allows guest activity to be adopted by the first authenticated identity', () => {
    prepareWorkspaceLocalStateForGuest();
    recordWorkspaceActivity({ label: 'Tried sample lab', href: '/labs', color: 'labs', kind: 'action' });

    expect(prepareWorkspaceLocalStateForUser('clerk-user-a')).toBe('adopted');
    expect(getWorkspaceLocalOwner()).toBe('clerk-user-a');
    expect(getWorkspaceActivity()).toHaveLength(1);
  });

  it('clears another signed-in account cache before adopting a new identity', () => {
    prepareWorkspaceLocalStateForUser('clerk-user-a');
    recordWorkspaceActivity({ label: 'Private activity A', href: '/vault', color: 'vault', kind: 'action' });
    mergeWorkspaceState({ recents: [{ href: '/vault', label: 'Vault', color: 'vault', at: 2000 }] });

    expect(prepareWorkspaceLocalStateForUser('clerk-user-b')).toBe('switched');
    expect(getWorkspaceLocalOwner()).toBe('clerk-user-b');
    expect(getWorkspaceActivity()).toEqual([]);
    expect(getWorkspaceRecents()).toEqual([]);
  });

  it('starts a clean guest cache after a signed-in identity leaves the app', () => {
    prepareWorkspaceLocalStateForUser('clerk-user-a');
    recordWorkspaceActivity({ label: 'Private activity A', href: '/collab', color: 'collab', kind: 'action' });

    expect(prepareWorkspaceLocalStateForGuest()).toBe('cleared');
    expect(getWorkspaceLocalOwner()).toBe('guest');
    expect(getWorkspaceActivity()).toEqual([]);
  });
});
