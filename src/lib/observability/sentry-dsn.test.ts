import { describe, expect, it } from 'vitest';
import { normalizeSentryDsn } from './sentry-dsn';

describe('normalizeSentryDsn', () => {
  it.each([
    null,
    undefined,
    '',
    '   ',
    'https://sentry.io',
    'https://o1.ingest.sentry.io/123',
    'https://publickey@o1.ingest.sentry.io/project',
    'ftp://publickey@o1.ingest.sentry.io/123',
    'https://publickey@o1.ingest.sentry.io/123?debug=true',
    'https://publickey@o1.ingest.sentry.io/123#fragment',
    'not-a-url',
  ])('rejects malformed or non-project DSNs: %s', (value) => {
    expect(normalizeSentryDsn(value)).toBeNull();
  });

  it.each([
    'https://publickey@o1.ingest.sentry.io/123',
    'https://publickey@sentry.example.com/42',
    'http://publickey@localhost:9000/7',
    'https://publickey@sentry.example.com/prefix/42',
  ])('accepts hosted and self-hosted project DSNs: %s', (value) => {
    expect(normalizeSentryDsn(value)).toBe(value);
  });

  it('trims surrounding whitespace from a valid DSN', () => {
    expect(normalizeSentryDsn('  https://publickey@o1.ingest.sentry.io/123  ')).toBe(
      'https://publickey@o1.ingest.sentry.io/123'
    );
  });
});
