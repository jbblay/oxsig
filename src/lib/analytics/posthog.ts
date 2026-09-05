import 'server-only';

import { PostHog } from 'posthog-node';

type ProductEventProperties = Record<string, string | number | boolean | null | undefined>;

function config() {
  const token = String(process.env.POSTHOG_PROJECT_TOKEN || '').trim();
  const host = String(process.env.POSTHOG_HOST || '').trim();
  return token && host ? { token, host } : null;
}

export function productAnalyticsConfigured() {
  return Boolean(config());
}

/**
 * Capture a deliberately allow-listed product event from trusted server code.
 *
 * Callers must not pass prompts, terminal input/output, collaboration message
 * text, email addresses, filenames, uploaded content, or other user-generated
 * content. Analytics failure is intentionally non-fatal to the product action.
 */
export async function captureProductEvent(input: {
  distinctId: string;
  event: string;
  properties?: ProductEventProperties;
}) {
  const configured = config();
  if (!configured || !input.distinctId || !input.event) return false;

  const client = new PostHog(configured.token, {
    host: configured.host,
    flushAt: 1,
    flushInterval: 0,
    requestTimeout: 1500,
  });

  try {
    // PostHog recommends captureImmediate for short-lived/serverless runtimes so
    // the request completes before the function can be suspended. The bounded
    // timeout prevents analytics availability from materially delaying OXSIG.
    await client.captureImmediate({
      distinctId: input.distinctId,
      event: input.event,
      properties: input.properties,
    });
    await client.shutdown();
    return true;
  } catch (error) {
    console.warn('[oxsig] Product analytics capture failed:', error);
    try {
      await client.shutdown();
    } catch {
      // The user-facing product action must not fail because analytics is down.
    }
    return false;
  }
}
