import 'server-only';

import { getPool } from '@/lib/db/pool';
import {
  ClerkIdentityRetiredError,
  deactivateClerkUser,
  identityLifecycleSchema,
  upsertClerkUser,
} from './clerk-user';

/** Minimal structural view of the Clerk webhook payloads OXSIG consumes. */
type ClerkEmailAddress = {
  id: string;
  email_address: string;
  verification?: { status?: string | null } | null;
};

export type ClerkWebhookEvent = {
  type: string;
  data: {
    id?: string | null;
    email_addresses?: ClerkEmailAddress[];
    primary_email_address_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    image_url?: string | null;
    updated_at?: number | null;
    [key: string]: unknown;
  };
};

export type ClerkWebhookOutcome =
  | 'synced'
  | 'deactivated'
  | 'duplicate'
  | 'ignored_retired_identity'
  | 'ignored_event_type';

const DELIVERY_RETENTION_DAYS = 30;

async function alreadyProcessed(svixId: string | null): Promise<boolean> {
  if (!svixId) return false;
  const schema = await identityLifecycleSchema();
  if (!schema.deliveries) return false;
  const result = await getPool().query(
    `SELECT 1 FROM clerk_webhook_deliveries WHERE svix_id = $1 LIMIT 1`,
    [svixId]
  );
  return Boolean(result.rows[0]);
}

/**
 * Record a delivery only after it was processed successfully, so a failed
 * attempt is retried by Svix instead of being skipped as a duplicate.
 */
async function recordDelivery(svixId: string | null, event: ClerkWebhookEvent) {
  if (!svixId) return;
  const schema = await identityLifecycleSchema();
  if (!schema.deliveries) return;
  const pool = getPool();
  await pool.query(
    `INSERT INTO clerk_webhook_deliveries (svix_id, event_type, clerk_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (svix_id) DO NOTHING`,
    [svixId, event.type.slice(0, 64), typeof event.data?.id === 'string' ? event.data.id : null]
  );
  await pool.query(
    `DELETE FROM clerk_webhook_deliveries WHERE received_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [DELIVERY_RETENTION_DAYS]
  ).catch((error) => console.error('Clerk webhook delivery pruning failed:', error));
}

function snapshotFromEvent(data: ClerkWebhookEvent['data'], clerkUserId: string) {
  const addresses = Array.isArray(data.email_addresses) ? data.email_addresses : [];
  const primaryEmail = addresses.find((address) => address.id === data.primary_email_address_id) || addresses[0];
  const displayName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || data.username || null;
  return {
    clerkUserId,
    email: primaryEmail?.email_address || null,
    emailVerified: primaryEmail?.verification?.status === 'verified',
    displayName,
    avatarUrl: data.image_url || null,
    sourceUpdatedAt: typeof data.updated_at === 'number' ? new Date(data.updated_at) : null,
  };
}

/**
 * Apply a verified Clerk webhook event. Throws only for transient failures
 * (database unavailable, etc.) so the caller can answer 5xx and Svix retries.
 * Events that can never succeed (retired identities) are acknowledged.
 */
export async function processClerkWebhookEvent(
  event: ClerkWebhookEvent,
  svixId: string | null
): Promise<ClerkWebhookOutcome> {
  if (await alreadyProcessed(svixId)) return 'duplicate';

  const clerkUserId = typeof event.data?.id === 'string' && event.data.id ? event.data.id : null;
  let outcome: ClerkWebhookOutcome;

  if ((event.type === 'user.created' || event.type === 'user.updated') && clerkUserId) {
    try {
      await upsertClerkUser(snapshotFromEvent(event.data, clerkUserId));
      outcome = 'synced';
    } catch (error) {
      if (!(error instanceof ClerkIdentityRetiredError)) throw error;
      outcome = 'ignored_retired_identity';
    }
  } else if (event.type === 'user.deleted' && clerkUserId) {
    await deactivateClerkUser(clerkUserId, 'clerk_webhook');
    outcome = 'deactivated';
  } else {
    outcome = 'ignored_event_type';
  }

  await recordDelivery(svixId, event);
  return outcome;
}
