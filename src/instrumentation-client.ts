import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';

const sentryDsn = String(process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim();

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
    enabled: true,
  });
}

const posthogToken = String(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || '').trim();
const posthogHost = String(process.env.NEXT_PUBLIC_POSTHOG_HOST || '').trim();

if (posthogToken && posthogHost) {
  posthog.init(posthogToken, {
    api_host: posthogHost,
    defaults: '2026-05-30',

    // OXSIG contains terminals, collaboration content, AI prompts and learning
    // evidence. Start with explicit product events only rather than collecting
    // arbitrary screen/input content. These can be revisited deliberately if a
    // future privacy review approves broader analytics.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: 'identified_only',
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
