import { describe, expect, it } from 'vitest';
import { sanitizePostgresText, stringifyPostgresJson } from './postgres-safe';

describe('postgres-safe serialization', () => {
  it('replaces NUL code points in text with a visible shell-safe escape', () => {
    expect(sanitizePostgresText(`a\u0000b`)).toBe('a\\0b');
  });

  it('removes PostgreSQL-incompatible NUL escapes from nested JSON strings', () => {
    const serialized = stringifyPostgresJson({
      command: `tr '\u0000' '\n'`,
      nested: { stdout: `left\u0000right` },
    });

    expect(serialized).not.toContain('\\u0000');
    expect(JSON.parse(serialized)).toEqual({
      command: "tr '\\0' '\n'",
      nested: { stdout: 'left\\0right' },
    });
  });
});
