import { describe, expect, it } from 'vitest';
import {
  InvalidPostgresJsonKeyError,
  sanitizePostgresJsonValue,
  sanitizePostgresParameter,
  sanitizePostgresParameters,
  sanitizePostgresText,
  stringifyPostgresJson,
} from './postgres-safe';

describe('postgres-safe serialization', () => {
  it('replaces actual NUL code points in text with a visible escape', () => {
    expect(sanitizePostgresText('a\u0000b')).toBe('a\\0b');
  });

  it('serializes nested JSON values explicitly without NUL characters', () => {
    const serialized = stringifyPostgresJson({ nested: [{ stdout: 'left\u0000right' }] });
    expect(JSON.parse(serialized)).toEqual({ nested: [{ stdout: 'left\\0right' }] });
    expect(sanitizePostgresParameter(serialized)).toBe(serialized);
  });

  it.each([
    String.raw`{ "n": 9007199254740993, "example": "\\u0000" }`,
    String.raw`{"duplicate":1,"duplicate":2,"example":"\\u0000"}`,
    String.raw`{"n":9007199254740993,"value":"\u0000"}`,
    String.raw`{"example":"\\\\u0000"}`,
    String.raw`not JSON: \u0000`,
  ])('preserves text parameter bytes instead of interpreting JSON: %s', (text) => {
    expect(sanitizePostgresParameter(text)).toBe(text);
  });

  it.each([
    { ['bad\u0000key']: 'value' },
    { nested: [{ ['bad\u0000key']: 'value' }] },
    { ['bad\u0000key']: 1, ['bad\\0key']: 2 },
  ])('rejects NUL keys without renaming or discarding data', (value) => {
    expect(() => stringifyPostgresJson(value)).toThrow(InvalidPostgresJsonKeyError);
    expect(() => sanitizePostgresJsonValue(value)).toThrow(InvalidPostgresJsonKeyError);
    expect(() => sanitizePostgresParameter(value)).toThrow(InvalidPostgresJsonKeyError);
  });

  it('handles toJSON output before checking JSON keys and values', () => {
    expect(JSON.parse(stringifyPostgresJson({ toJSON: () => ({ text: 'a\u0000b' }) })))
      .toEqual({ text: 'a\\0b' });
    expect(() => stringifyPostgresJson({ toJSON: () => ({ ['bad\u0000key']: 1 }) }))
      .toThrow(InvalidPostgresJsonKeyError);
  });

  it('sanitizes nested parameter arrays and plain objects without mutating inputs', () => {
    const input = ['plain\u0000text', { nested: 'object\u0000text' }, ['array\u0000text']];
    expect(sanitizePostgresParameters(input)).toEqual([
      'plain\\0text', { nested: 'object\\0text' }, ['array\\0text'],
    ]);
    expect(input[0]).toBe('plain\u0000text');
  });

  it('preserves binary Buffer and Date parameters', () => {
    const binary = Buffer.from([0, 1, 2, 255]);
    const date = new Date('2026-01-01T00:00:00Z');
    expect(sanitizePostgresParameter(binary)).toBe(binary);
    expect(sanitizePostgresParameter(date)).toBe(date);
  });
});
