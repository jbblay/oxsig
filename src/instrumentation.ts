import * as Sentry from '@sentry/nextjs';
import { normalizeSentryDsn } from './lib/observability/sentry-dsn';

function sentryDsn() {
  return normalizeSentryDsn(process.env.SENTRY_DSN);
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
