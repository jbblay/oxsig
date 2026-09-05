'use client';

import * as React from 'react';
import { useUser } from '@clerk/nextjs';
import posthog from 'posthog-js';

const analyticsConfigured = Boolean(
  String(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || '').trim() &&
  String(process.env.NEXT_PUBLIC_POSTHOG_HOST || '').trim()
);

export default function PostHogIdentity() {
  const { isLoaded, isSignedIn, user } = useUser();
  const identifiedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!analyticsConfigured || !isLoaded) return;

    if (isSignedIn && user?.id) {
      if (identifiedRef.current !== user.id) {
        // Use the stable Clerk subject only. Do not send email, name, prompts,
        // collaboration content, terminal content or other profile properties.
        posthog.identify(user.id);
        identifiedRef.current = user.id;
      }
      return;
    }

    if (identifiedRef.current) {
      posthog.reset();
      identifiedRef.current = null;
    }
  }, [isLoaded, isSignedIn, user?.id]);

  return null;
}
