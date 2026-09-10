import { beforeEach, describe, expect, it } from 'vitest';
import { getStoryboardDraftScope, setStoryboardDraftScope } from './storage-scope';

describe('storyboard recovery draft scope', () => {
  beforeEach(() => {
    setStoryboardDraftScope(undefined);
  });

  it('waits for authentication to resolve instead of falling back to guest storage', async () => {
    let resolved = false;
    const pending = getStoryboardDraftScope().then((scope) => {
      resolved = true;
      return scope;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    setStoryboardDraftScope('user_alpha');
    await expect(pending).resolves.toBe('account:user_alpha');
  });

  it('uses an explicit guest namespace for signed-out browsing', async () => {
    setStoryboardDraftScope(null);
    await expect(getStoryboardDraftScope()).resolves.toBe('guest');
  });

  it('switches recovery namespaces when the authenticated identity changes', async () => {
    setStoryboardDraftScope('user_alpha');
    await expect(getStoryboardDraftScope()).resolves.toBe('account:user_alpha');

    setStoryboardDraftScope('user_beta');
    await expect(getStoryboardDraftScope()).resolves.toBe('account:user_beta');
  });
});
