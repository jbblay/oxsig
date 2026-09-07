import { describe, expect, it } from 'vitest';
import {
  sanitizePostgresParameter,
  sanitizePostgresParameters,
  sanitizePostgresText,
  stringifyPostgresJson,
} from './postgres-safe';

describe('postgres-safe serialization', () => {
  it('replaces actual NUL code points in text with a visible escape', () => {
    expect(sanitizePostgresText(`a\u0000b`)).toBe('a\\0b');
  });

  it('removes PostgreSQL-incompatible NUL code points from nested JSON strings', () => {
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

  it('repairs already-serialized JSON that contains a JSON NUL escape', () => {
    const serialized = JSON.stringify({ stdout: `left\u0000right` });
    const safe = sanitizePostgresParameter(serialized);

    expect(safe).not.toContain('\\u0000');
    expect(JSON.parse(safe)).toEqual({ stdout: 'left\\0right' });
  });

  it('sanitizes nested parameter arrays and plain objects at the database boundary', () => {
    const values = sanitizePostgresParameters([
      `plain\u0000text`,
      { nested: `object\u0000text` },
      [`array\u0000text`],
    ]);

    expect(values).toEqual([
      'plain\\0text',
      { nested: 'object\\0text' },
      ['array\\0text'],
    ]);
  });

  it('does not reinterpret binary Buffer parameters', () => {
    const binary = Buffer.from([0, 1, 2, 255]);
    const sanitized = sanitizePostgresParameter(binary);

    expect(sanitized).toBe(binary);
    expect(Buffer.isBuffer(sanitized)).toBe(true);
    expect([...sanitized]).toEqual([0, 1, 2, 255]);
  });
});
