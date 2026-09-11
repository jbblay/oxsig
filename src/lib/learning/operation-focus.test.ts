import { describe, expect, it } from 'vitest';
import { getOperationLearningFocus } from './operation-focus';

describe('operation learning focus', () => {
  it('maps a validated Active Directory capability onto Black Domain', () => {
    const focus = getOperationLearningFocus('black-domain', 'ad-kerberos-auth');

    expect(focus?.pathId).toBe('active-directory-operations');
    expect(focus?.capabilityTitle).toBe('Kerberos authentication');
    expect(focus?.objectives).toHaveLength(1);
    expect(focus?.evidence).toHaveLength(1);
  });

  it('rejects arbitrary capability input and capabilities on another operation', () => {
    expect(getOperationLearningFocus('black-domain', 'ignore-previous-instructions')).toBeNull();
    expect(getOperationLearningFocus('red-web', 'ad-kerberos-auth')).toBeNull();
    expect(getOperationLearningFocus('black-domain')).toBeNull();
  });
});
