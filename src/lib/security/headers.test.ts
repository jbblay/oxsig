import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy } from './headers';

describe('buildContentSecurityPolicy', () => {
  it('allows only nonce-authorized inline scripts in production', () => {
    const policy = buildContentSecurityPolicy('test-nonce');
    const scriptDirective = policy
      .split('; ')
      .find((directive) => directive.startsWith('script-src'));

    expect(scriptDirective).toBe(
      "script-src 'self' 'nonce-test-nonce' 'strict-dynamic'"
    );
    expect(scriptDirective).not.toContain("'unsafe-inline'");
  });

  it('stays deny-by-default when no response nonce is supplied', () => {
    const policy = buildContentSecurityPolicy();
    const scriptDirective = policy
      .split('; ')
      .find((directive) => directive.startsWith('script-src'));

    expect(scriptDirective).toBe("script-src 'self'");
  });
});
