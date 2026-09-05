import * as Sentry from '@sentry/nextjs';

const dsn = String(process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
    enabled: true,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
