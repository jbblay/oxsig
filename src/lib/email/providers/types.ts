export type EmailProviderId = 'resend' | 'ses';

export type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  tags?: Array<{ name: string; value: string }>;
};

export type EmailDeliveryResult = {
  configured: boolean;
  sent: boolean;
  provider: EmailProviderId;
  messageId: string | null;
  error: string | null;
};

export type EmailProvider = {
  id: EmailProviderId;
  configured: () => boolean;
  send: (input: SendTransactionalEmailInput) => Promise<EmailDeliveryResult>;
};
