import 'server-only';

type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  tags?: Array<{ name: string; value: string }>;
};

export type EmailDeliveryResult = {
  configured: boolean;
  sent: boolean;
  provider: 'resend';
  messageId: string | null;
  error: string | null;
};

function env(name: string) {
  return String(process.env[name] || '').trim();
}

export function emailProviderConfigured() {
  return Boolean(env('RESEND_API_KEY') && env('EMAIL_FROM'));
}

export function publicAppUrl(fallbackOrigin?: string) {
  const configured = env('OXSIG_APP_URL');
  if (configured) return configured.replace(/\/$/, '');
  return String(fallbackOrigin || '').replace(/\/$/, '');
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput
): Promise<EmailDeliveryResult> {
  const apiKey = env('RESEND_API_KEY');
  const from = env('EMAIL_FROM');

  if (!apiKey || !from) {
    return {
      configured: false,
      sent: false,
      provider: 'resend',
      messageId: null,
      error: null,
    };
  }

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
      return {
        configured: true,
        sent: false,
        provider: 'resend',
        messageId: null,
        error: String(payload?.message || payload?.error || `Resend request failed (${response.status})`).slice(0, 1000),
      };
    }

    return {
      configured: true,
      sent: true,
      provider: 'resend',
      messageId: typeof payload?.id === 'string' ? payload.id : null,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      sent: false,
      provider: 'resend',
      messageId: null,
      error: error instanceof Error ? error.message.slice(0, 1000) : 'Email provider request failed',
    };
  }
}

export function escapeEmailHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
