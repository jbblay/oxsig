import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { vaultCreateSchema, vaultUpdateSchema } from './server';

describe('Vault metadata validation', () => {
  it.each([vaultCreateSchema, vaultUpdateSchema])('rejects nested NUL keys with validation details', (schema) => {
    const result = schema.safeParse({
      kind: 'concept', title: 'Example', metadata: { nested: [{ ['bad\u0000key']: 1 }] },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.metadata)
        .toContain('JSON object keys must not contain NUL characters.');
    }
  });

  it('preserves valid text and allows NUL values for explicit JSON sanitization', () => {
    const body = String.raw`{ "n": 9007199254740993, "example": "\\u0000" }`;
    const result = vaultCreateSchema.parse({
      kind: 'concept', title: 'Example', body, metadata: { ['literal\\0key']: 'a\u0000b' },
    });
    expect(result.body).toBe(body);
    expect(result.metadata).toEqual({ ['literal\\0key']: 'a\u0000b' });
  });
});
