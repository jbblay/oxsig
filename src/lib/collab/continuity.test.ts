import { beforeEach, describe, expect, it } from 'vitest';
import {
  collaborationDraftStorageKey,
  readCollaborationDraft,
  writeCollaborationDraft,
} from './draft-storage';
import {
  collaborationScrollBehavior,
  isNearConversationBottom,
  newMessageDisposition,
} from './reading-state';

describe('Collaboration draft storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('isolates drafts by account identity and collaboration session', () => {
    writeCollaborationDraft('account-a', 'alpha', 'A alpha');
    writeCollaborationDraft('account-a', 'beta', 'A beta');
    writeCollaborationDraft('account-b', 'alpha', 'B alpha');

    expect(readCollaborationDraft('account-a', 'alpha')).toBe('A alpha');
    expect(readCollaborationDraft('account-a', 'beta')).toBe('A beta');
    expect(readCollaborationDraft('account-b', 'alpha')).toBe('B alpha');
  });

  it('clears only the requested session draft and never assigns anonymous storage', () => {
    writeCollaborationDraft('account-a', 'alpha', 'A alpha');
    writeCollaborationDraft('account-a', 'beta', 'A beta');
    window.localStorage.setItem('oxsig:collaboration-drafts:legacy', JSON.stringify({ alpha: 'legacy' }));

    writeCollaborationDraft('account-a', 'alpha', '');

    expect(readCollaborationDraft('account-a', 'alpha')).toBe('');
    expect(readCollaborationDraft('account-a', 'beta')).toBe('A beta');
    expect(readCollaborationDraft(null, 'alpha')).toBe('');
    expect(window.localStorage.getItem(collaborationDraftStorageKey('account-a'))).toContain('A beta');
  });
});

describe('Collaboration reading state', () => {
  it('distinguishes an older-history reader from a near-bottom reader', () => {
    expect(isNearConversationBottom({ scrollHeight: 1000, scrollTop: 200, clientHeight: 300 })).toBe(false);
    expect(isNearConversationBottom({ scrollHeight: 1000, scrollTop: 650, clientHeight: 300 })).toBe(true);
  });

  it('uses message identity to decide whether to follow or announce', () => {
    expect(newMessageDisposition('m-1', 'm-1', false)).toBe('none');
    expect(newMessageDisposition('m-1', 'm-2', true)).toBe('follow');
    expect(newMessageDisposition('m-1', 'm-2', false)).toBe('announce');
  });

  it('disables smooth scrolling when reduced motion is preferred', () => {
    expect(collaborationScrollBehavior(false)).toBe('smooth');
    expect(collaborationScrollBehavior(true)).toBe('auto');
  });
});
