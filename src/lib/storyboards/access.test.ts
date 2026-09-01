import { describe, expect, it } from 'vitest';
import {
  canEditStoryboard,
  canManageStoryboard,
  resolveStoryboardPermission,
} from './access';

describe('storyboard authorization', () => {
  it('always gives the owner management access', () => {
    const permission = resolveStoryboardPermission('alice', 'alice');
    expect(permission).toBe('owner');
    expect(canEditStoryboard(permission)).toBe(true);
    expect(canManageStoryboard(permission)).toBe(true);
  });

  it('limits viewers and allows editors to write', () => {
    expect(canEditStoryboard(resolveStoryboardPermission('alice', 'bob', { permission: 'viewer' }))).toBe(false);
    expect(canEditStoryboard(resolveStoryboardPermission('alice', 'charlie', { permission: 'editor' }))).toBe(true);
  });

  it('denies revoked and expired grants', () => {
    expect(resolveStoryboardPermission('alice', 'bob', {
      permission: 'editor',
      revokedAt: '2026-01-01T00:00:00.000Z',
    })).toBeNull();
    expect(resolveStoryboardPermission('alice', 'bob', {
      permission: 'viewer',
      expiresAt: '2026-01-01T00:00:00.000Z',
    }, new Date('2026-02-01T00:00:00.000Z'))).toBeNull();
  });
});
