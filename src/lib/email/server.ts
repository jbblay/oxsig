import 'server-only';

import { resendEmailProvider } from './providers/resend';
import { sesEmailProvider } from './providers/ses';
import type { EmailDeliveryResult, EmailProvider, EmailProviderId, SendTransactionalEmailInput } from './providers/types';

export type { EmailDeliveryResult, SendTransactionalEmailInput } from './providers/types';

/**
 * Provider-independent transactional email.
 *
 *   OXSIG_EMAIL_PROVIDER = resend (default) | ses
 *
 * Cutover is a single env change and is reversible the same way. Resend stays
 * the default so existing deployments behave exactly as before.
 */
const PROVIDERS: Record<EmailProviderId, EmailProvider> = {
  resend: resendEmailProvider,
  ses: sesEmailProvider,
};

export function activeEmailProviderId(env: Record<string, string | undefined> = process.env): EmailProviderId {
  const id = env.OXSIG_EMAIL_PROVIDER?.trim().toLowerCase();
  return id === 'ses' ? 'ses' : 'resend';
}

function activeProvider() {
  return PROVIDERS[activeEmailProviderId()];
}

export function emailProviderConfigured() {
  return activeProvider().configured();
}

export async function sendTransactionalEmail(input: SendTransactionalEmailInput): Promise<EmailDeliveryResult> {
  return activeProvider().send(input);
}

export function publicAppUrl(fallbackOrigin?: string) {
  const configured = String(process.env.OXSIG_APP_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return String(fallbackOrigin || '').replace(/\/$/, '');
}

export function escapeEmailHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
