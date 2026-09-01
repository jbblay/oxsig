import type { StoryboardPermission } from './types';

export type StoryboardShareGrant = {
  permission: 'viewer' | 'editor';
  revokedAt?: Date | string | null;
  expiresAt?: Date | string | null;
};

export function resolveStoryboardPermission(
  ownerId: string,
  userId: string,
  share?: StoryboardShareGrant | null,
  now = new Date()
): StoryboardPermission | null {
  if (ownerId === userId) return 'owner';
  if (!share || share.revokedAt) return null;
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= now.getTime()) return null;
  return share.permission;
}

export function canEditStoryboard(permission: StoryboardPermission | null): boolean {
  return permission === 'owner' || permission === 'editor';
}

export function canManageStoryboard(permission: StoryboardPermission | null): boolean {
  return permission === 'owner';
}
