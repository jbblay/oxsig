import { describe, expect, it } from 'vitest';
import { presignSsmBrowserStreamUrl } from './ssm-websocket-presign';

const credentials = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  sessionToken: 'temporary/session+token=',
};

describe('presignSsmBrowserStreamUrl', () => {
  it('query-presigns the exact ssmmessages websocket endpoint for browser use', async () => {
    const signed = await presignSsmBrowserStreamUrl(
      'wss://ssmmessages.eu-central-1.amazonaws.com/v1/data-channel/test-session?role=publish_subscribe',
      'eu-central-1',
      credentials,
      60
    );
    const url = new URL(signed);

    expect(url.protocol).toBe('wss:');
    expect(url.hostname).toBe('ssmmessages.eu-central-1.amazonaws.com');
    expect(url.pathname).toBe('/v1/data-channel/test-session');
    expect(url.searchParams.get('role')).toBe('publish_subscribe');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('/eu-central-1/ssmmessages/aws4_request');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('host');
    expect(url.searchParams.get('X-Amz-Security-Token')).toBe(credentials.sessionToken);
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses to sign an unexpected websocket host', async () => {
    await expect(
      presignSsmBrowserStreamUrl('wss://example.com/v1/data-channel/test', 'eu-central-1', credentials)
    ).rejects.toThrow('unexpected terminal stream endpoint');
  });
});
