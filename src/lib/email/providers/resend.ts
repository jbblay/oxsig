import 'server-only';

import type { EmailDeliveryResult, EmailProvider, SendTransactionalEmailInput } from './types';

function env(name: string) {
  return String(process.env[name] || '').trim();
}

function result(partial: Omit<EmailDeliveryResult, 'provider'>): EmailDeliveryResult {
  return { ...partial, provider: 'resend' };
}

async function send(input: SendTransactionalEmailInput): Promise<EmailDeliveryResult> {
  const apiKey = env('RESEND_API_KEY');
  const from = env('EMAIL_FROM');
  if (!apiKey || !from) return result({ configured: false, sent: false, messageId: null, error: null });

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return result({
        configured: true,
        sent: false,
        messageId: null,
        error: String(payload?.message || payload?.error || `Resend request failed (${response.status})`).slice(0, 1000),
      });
    }

    return result({
      configured: true,
      sent: true,
      messageId: typeof payload?.id === 'string' ? payload.id : null,
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

export const resendEmailProvider: EmailProvider = {
  id: 'resend',
  configured: () => Boolean(env('RESEND_API_KEY') && env('EMAIL_FROM')),
  send,
};
