import 'server-only';

import { awsErrorMessage, signedAwsJsonRequest, type AwsCredentialProvider } from '@/lib/aws/signed-request';
import type { EmailDeliveryResult, EmailProvider, SendTransactionalEmailInput } from './types';

/**
 * Amazon SES v2 (SendEmail) adapter.
 *
 *   EMAIL_FROM             verified SES identity (shared with Resend)
 *   SES_REGION             defaults to AWS_REGION, then eu-central-1
 *   SES_CONFIGURATION_SET  optional; enables bounce/complaint event publishing
 */
type Env = Record<string, string | undefined>;

const value = (env: Env, name: string) => String(env[name] || '').trim();

export function sesRegion(env: Env = process.env) {
  return value(env, 'SES_REGION') || value(env, 'AWS_REGION') || 'eu-central-1';
}

/** SES message tags allow [A-Za-z0-9_-.] (max 256 chars). */
function sesTag(text: string) {
  return text.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 256) || '_';
}

export function buildSesSendEmailRequest(input: SendTransactionalEmailInput, env: Env = process.env) {
  const configurationSet = value(env, 'SES_CONFIGURATION_SET');
  return {
    FromEmailAddress: value(env, 'EMAIL_FROM'),
    Destination: { ToAddresses: [input.to] },
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: input.html, Charset: 'UTF-8' },
          ...(input.text ? { Text: { Data: input.text, Charset: 'UTF-8' } } : {}),
        },
      },
    },
    ...(input.tags?.length ? { EmailTags: input.tags.map((tag) => ({ Name: sesTag(tag.name), Value: sesTag(tag.value) })) } : {}),
    ...(configurationSet ? { ConfigurationSetName: configurationSet } : {}),
  };
}

export function createSesEmailProvider(options: {
  credentials?: AwsCredentialProvider;
  fetchImpl?: typeof fetch;
  env?: Env;
} = {}): EmailProvider {
  const env = () => options.env ?? process.env;
  const result = (partial: Omit<EmailDeliveryResult, 'provider'>): EmailDeliveryResult => ({ ...partial, provider: 'ses' });

  async function send(input: SendTransactionalEmailInput): Promise<EmailDeliveryResult> {
    if (!value(env(), 'EMAIL_FROM')) return result({ configured: false, sent: false, messageId: null, error: null });
    const region = sesRegion(env());
    try {
      const response = await signedAwsJsonRequest({
        service: 'ses',
        region,
        hostname: `email.${region}.amazonaws.com`,
        path: '/v2/email/outbound-emails',
        body: buildSesSendEmailRequest(input, env()),
        credentials: options.credentials,
        fetchImpl: options.fetchImpl,
      });
      if (!response.ok) {
        return result({ configured: true, sent: false, messageId: null, error: await awsErrorMessage(response, 'SES request failed') });
      }
      const payload = await response.json().catch(() => ({}));
      return result({
        configured: true,
        sent: true,
        messageId: typeof payload?.MessageId === 'string' ? payload.MessageId : null,
        error: null,
      });
    } catch (error) {
      return result({
        configured: true,
        sent: false,
        messageId: null,
        error: error instanceof Error ? error.message.slice(0, 1000) : 'Email provider request failed',
      });
    }
  }

  return {
    id: 'ses',
    configured: () => Boolean(value(env(), 'EMAIL_FROM')),
    send,
  };
}

export const sesEmailProvider = createSesEmailProvider();
