import { describe, expect, it } from 'vitest';
import { getRequestMetadata } from './logger';

function requestWithHeaders(headers: Record<string, string>) {
  return {
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
  };
}

describe('getRequestMetadata', () => {
  it('uses the first forwarded IP address', () => {
    expect(getRequestMetadata(requestWithHeaders({
      'x-forwarded-for': '203.0.113.20, 10.0.0.1',
      'user-agent': 'OXSIG test',
    }))).toEqual({
      ipAddress: '203.0.113.20',
      userAgent: 'OXSIG test',
    });
  });

  it('omits a missing IP instead of writing an invalid INET value', () => {
    expect(getRequestMetadata(requestWithHeaders({}))).toEqual({
      ipAddress: undefined,
      userAgent: 'unknown',
    });
  });
});
