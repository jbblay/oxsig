'use client';

import { notifyLocalStorageChange, subscribeToLocalStorageChanges } from './storage-change-observer';

export const WORKSPACE_ACTIVITY_KEY = 'oxsig:workspace-activity:v1';
export const WORKSPACE_RECENTS_KEY = 'oxsig:workspace-recents:v1';
export const WORKSPACE_LOCAL_OWNER_KEY = 'oxsig:workspace-local-owner:v1';
const GUEST_OWNER = 'guest';

export type WorkspaceColor = 'home' | 'labs' | 'live' | 'collab' | 'boards' | 'vault' | 'manage';
export type WorkspaceActivity = {
  id: string;
  label: string;
  detail?: string;
  href?: string;
  color: WorkspaceColor;
  kind: 'navigation' | 'action' | 'system';
  at: number;
};

export type WorkspaceRecent = {
  href: string;
  label: string;
  color: WorkspaceColor;
  at: number;
};

const destinations = [
  { match: (path: string) => path.startsWith('/collab/storyboards'), href: '/collab/storyboards', label: 'Boards', color: 'boards' },
  { match: (path: string) => path.startsWith('/collab'), href: '/collab', label: 'Collaboration', color: 'collab' },
  { match: (path: string) => path.startsWith('/operations'), href: '/operations', label: 'Operations', color: 'labs' },
  { match: (path: string) => path.startsWith('/warroom'), href: '/warroom', label: 'WarRoom', color: 'live' },
  { match: (path: string) => path.startsWith('/labs'), href: '/labs', label: 'Cyber Lab', color: 'labs' },
  { match: (path: string) => path.startsWith('/live'), href: '/live', label: 'Live Workspace', color: 'live' },
  { match: (path: string) => path.startsWith('/vault'), href: '/vault', label: 'Vault', color: 'vault' },
  { match: (path: string) => path.startsWith('/manage'), href: '/manage', label: 'Resources', color: 'manage' },
  { match: (path: string) => path.startsWith('/account'), href: '/account', label: 'Account', color: 'home' },
  { match: (path: string) => path.startsWith('/home'), href: '/home', label: 'Dashboard', color: 'home' },
] as const;

function read<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]) {
  if (typeof window === 'undefined') return;
  const next = JSON.stringify(value);
  if (window.localStorage.getItem(key) === next) return;
  window.localStorage.setItem(key, next);
  notifyLocalStorageChange(key);
}

export function getWorkspaceLocalOwner() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(WORKSPACE_LOCAL_OWNER_KEY);
}

export function prepareWorkspaceLocalStateForGuest() {
  if (typeof window === 'undefined') return 'unavailable' as const;
  const current = getWorkspaceLocalOwner();
  if (!current) {
    window.localStorage.setItem(WORKSPACE_LOCAL_OWNER_KEY, GUEST_OWNER);
    return 'guest' as const;
  }
  if (current === GUEST_OWNER) return 'guest' as const;

  window.localStorage.setItem(WORKSPACE_LOCAL_OWNER_KEY, GUEST_OWNER);
  write(WORKSPACE_ACTIVITY_KEY, []);
  write(WORKSPACE_RECENTS_KEY, []);
  return 'cleared' as const;
}

export function prepareWorkspaceLocalStateForUser(identityId: string) {
  if (typeof window === 'undefined') return 'unavailable' as const;
  const current = getWorkspaceLocalOwner();
  if (!current || current === GUEST_OWNER) {
    // Legacy/unclaimed state and explicit guest state may be adopted by the
    // first authenticated account so Try-as-guest can continue after sign-up.
    window.localStorage.setItem(WORKSPACE_LOCAL_OWNER_KEY, identityId);
    return 'adopted' as const;
  }
  if (current === identityId) return 'same' as const;

  // Never upload one signed-in account's browser activity into another account.
  window.localStorage.setItem(WORKSPACE_LOCAL_OWNER_KEY, identityId);
  write(WORKSPACE_ACTIVITY_KEY, []);
  write(WORKSPACE_RECENTS_KEY, []);
  return 'switched' as const;
}

export function getWorkspaceActivity() {
  return read<WorkspaceActivity>(WORKSPACE_ACTIVITY_KEY).slice(0, 24);
}

export function getWorkspaceRecents() {
  return read<WorkspaceRecent>(WORKSPACE_RECENTS_KEY).slice(0, 8);
}

export function getWorkspaceStateSnapshot() {
  return {
    activity: getWorkspaceActivity(),
    recents: getWorkspaceRecents(),
  };
}

export function mergeWorkspaceState(input: {
  activity?: WorkspaceActivity[];
  recents?: WorkspaceRecent[];
}) {
  const activityById = new Map<string, WorkspaceActivity>();
  for (const item of [...getWorkspaceActivity(), ...(input.activity || [])]) {
    const current = activityById.get(item.id);
    if (!current || item.at > current.at) activityById.set(item.id, item);
  }
  const activity = [...activityById.values()].sort((a, b) => b.at - a.at).slice(0, 24);

  const recentByHref = new Map<string, WorkspaceRecent>();
  for (const item of [...getWorkspaceRecents(), ...(input.recents || [])]) {
    const current = recentByHref.get(item.href);
    if (!current || item.at > current.at) recentByHref.set(item.href, item);
  }
  const recents = [...recentByHref.values()].sort((a, b) => b.at - a.at).slice(0, 8);

  write(WORKSPACE_ACTIVITY_KEY, activity);
  write(WORKSPACE_RECENTS_KEY, recents);
  return { activity, recents };
}

export function recordWorkspaceActivity(input: Omit<WorkspaceActivity, 'id' | 'at'>) {
  const item: WorkspaceActivity = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
  };
  write(WORKSPACE_ACTIVITY_KEY, [item, ...getWorkspaceActivity()].slice(0, 24));
}

export function recordWorkspaceVisit(pathname: string) {
  const destination = destinations.find((item) => item.match(pathname));
  if (!destination) return;
  const recent: WorkspaceRecent = {
    href: destination.href,
    label: destination.label,
    color: destination.color,
    at: Date.now(),
  };
  const next = [recent, ...getWorkspaceRecents().filter((item) => item.href !== recent.href)].slice(0, 8);
  write(WORKSPACE_RECENTS_KEY, next);
  recordWorkspaceActivity({
    label: `Opened ${destination.label}`,
    detail: 'Workspace ready',
    href: destination.href,
    color: destination.color,
    kind: 'navigation',
  });
}

export function clearWorkspaceActivity() {
  write(WORKSPACE_ACTIVITY_KEY, []);
}

export function subscribeWorkspaceActivity(callback: () => void) {
  return subscribeToLocalStorageChanges([WORKSPACE_ACTIVITY_KEY, WORKSPACE_RECENTS_KEY], callback);
}
