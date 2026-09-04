import { describe, expect, it } from 'vitest';
import { signSsmUpstreamHeaders, validateSsmUpstreamUrl } from './ssm-upstream-signing.mjs';

const credentials = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  sessionToken: 'temporary/session+token=',
};

const streamUrl = 'wss://ssmmessages.eu-central-1.amazonaws.com/v1/data-channel/test-session?role=publish_subscribe';

describe('SSM server WebSocket signing', () => {
  it('signs the exact AWS WebSocket GET with SigV4 headers', async () => {
    const headers = await signSsmUpstreamHeaders(streamUrl, 'eu-central-1', credentials);
    const authorization = headers.authorization || headers.Authorization;
    const securityToken = headers['x-amz-security-token'] || headers['X-Amz-Security-Token'];

    expect(authorization).toContain('AWS4-HMAC-SHA256');
    expect(authorization).toContain('Credential=AKIDEXAMPLE/');
    expect(authorization).toContain('/eu-central-1/ssmmessages/aws4_request');
    expect(authorization).toContain('SignedHeaders=host;');
    expect(securityToken).toBe(credentials.sessionToken);
  });

  it('accepts only the expected regional Session Manager data-channel endpoint', () => {
    expect(validateSsmUpstreamUrl(streamUrl, 'eu-central-1').hostname)
      .toBe('ssmmessages.eu-central-1.amazonaws.com');

    expect(() => validateSsmUpstreamUrl(
      'wss://example.com/v1/data-channel/test-session?role=publish_subscribe',
      'eu-central-1'
    )).toThrow('unexpected terminal stream endpoint');
  });
});
