import * as Sentry from '@sentry/nextjs';

function sentryDsn() {
  return String(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim();
}

function environmentName() {
  return String(process.env.VERCEL_ENV || process.env.NODE_ENV || 'development').trim();
}

export async function register() {
  const dsn = sentryDsn();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: environmentName(),
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
    enabled: true,
  });
}

// Next.js 15 forwards otherwise-unhandled Server Component, middleware and
// route errors through this hook. Caught errors still need explicit capture at
// the point where OXSIG intentionally converts them into a response.
export const onRequestError = Sentry.captureRequestError;
