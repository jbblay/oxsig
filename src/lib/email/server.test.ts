// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { activeEmailProviderId } from './server';
import { buildSesSendEmailRequest, createSesEmailProvider, sesRegion } from './providers/ses';

const credentials = async () => ({ accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' });
const message = {
  to: 'person@example.com',
  subject: 'You are invited',
  html: '<p>Hello</p>',
  text: 'Hello',
  tags: [{ name: 'type', value: 'collaboration invite' }],
};

afterEach(() => vi.unstubAllEnvs());

describe('email provider selection', () => {
  it('defaults to Resend and only switches to SES explicitly', () => {
    expect(activeEmailProviderId({})).toBe('resend');
    expect(activeEmailProviderId({ OXSIG_EMAIL_PROVIDER: 'SES' })).toBe('ses');
    expect(activeEmailProviderId({ OXSIG_EMAIL_PROVIDER: 'unknown' })).toBe('resend');
  });
});

describe('SES adapter', () => {
  it('maps the transactional email contract to SES v2 SendEmail', () => {
    expect(buildSesSendEmailRequest(message, { EMAIL_FROM: 'OXSIG <no-reply@example.com>', SES_CONFIGURATION_SET: 'oxsig' })).toEqual({
      FromEmailAddress: 'OXSIG <no-reply@example.com>',
      Destination: { ToAddresses: ['person@example.com'] },
      Content: {
        Simple: {
          Subject: { Data: 'You are invited', Charset: 'UTF-8' },
          Body: {
            Html: { Data: '<p>Hello</p>', Charset: 'UTF-8' },
            Text: { Data: 'Hello', Charset: 'UTF-8' },
          },
        },
      },
      EmailTags: [{ Name: 'type', Value: 'collaboration_invite' }],
      ConfigurationSetName: 'oxsig',
    });
  });

  it('reports not-configured without calling AWS when EMAIL_FROM is missing', async () => {
    const fetchImpl = vi.fn();
    const provider = createSesEmailProvider({ env: {}, credentials, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(provider.send(message)).resolves.toEqual({ configured: false, sent: false, provider: 'ses', messageId: null, error: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('signs the request for the SES endpoint and returns the message id', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ MessageId: 'ses-123' }), { status: 200 }));
    const provider = createSesEmailProvider({
      env: { EMAIL_FROM: 'no-reply@example.com', SES_REGION: 'eu-west-1' },
      credentials,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.send(message)).resolves.toEqual({ configured: true, sent: true, provider: 'ses', messageId: 'ses-123', error: null });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails');
    expect(init.headers.authorization).toMatch(/Credential=AKIDEXAMPLE\/\d{8}\/eu-west-1\/ses\/aws4_request/);
  });

  it('returns a failed delivery (not a throw) on SES errors', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: 'Email address is not verified.' }), {
      status: 400,
      headers: { 'x-amzn-errortype': 'MessageRejected' },
    }));
    const provider = createSesEmailProvider({ env: { EMAIL_FROM: 'a@example.com' }, credentials, fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await provider.send(message);
    expect(result).toMatchObject({ configured: true, sent: false, provider: 'ses' });
    expect(result.error).toBe('MessageRejected: Email address is not verified. (400)');
  });

  it('resolves the region from SES_REGION, then AWS_REGION', () => {
    expect(sesRegion({ SES_REGION: 'eu-west-1', AWS_REGION: 'us-east-1' })).toBe('eu-west-1');
    expect(sesRegion({ AWS_REGION: 'us-east-1' })).toBe('us-east-1');
    expect(sesRegion({})).toBe('eu-central-1');
  });
});
