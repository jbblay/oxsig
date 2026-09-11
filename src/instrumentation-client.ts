import * as Sentry from '@sentry/nextjs';
import { normalizeSentryDsn } from './lib/observability/sentry-dsn';

const dsn = normalizeSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
    enabled: true,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
