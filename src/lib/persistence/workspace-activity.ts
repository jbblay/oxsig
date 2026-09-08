'use client';

import { notifyLocalStorageChange, subscribeToLocalStorageChanges } from './storage-change-observer';

export const WORKSPACE_ACTIVITY_KEY = 'oxsig:workspace-activity:v1';
export const WORKSPACE_RECENTS_KEY = 'oxsig:workspace-recents:v1';

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
  window.localStorage.setItem(key, JSON.stringify(value));
  notifyLocalStorageChange(key);
}

export function getWorkspaceActivity() {
  return read<WorkspaceActivity>(WORKSPACE_ACTIVITY_KEY).slice(0, 24);
}

export function getWorkspaceRecents() {
  return read<WorkspaceRecent>(WORKSPACE_RECENTS_KEY).slice(0, 8);
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
