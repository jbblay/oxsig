import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { getPool } from '@/lib/db/pool';
import { isClerkConfigured } from './clerk-config';
import { getE2EAuthenticatedUserFromCookies, isE2EAuthEnabled } from './e2e-auth';

export interface ClerkMappedUser {
  id: string;
  did?: string;
  email?: string;
  name?: string;
  role: 'user' | 'admin';
  clerkUserId: string;
}

export interface ClerkUserSnapshot {
  clerkUserId: string;
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
  avatarUrl?: string | null;
  /** Clerk's `updated_at` for this snapshot. Older snapshots never overwrite newer ones. */
  sourceUpdatedAt?: Date | null;
}

export type ClerkIdentityRetirementSource = 'clerk_webhook' | 'self_service' | 'admin' | 'test_reset';

/**
 * The Clerk identity was deleted or its OXSIG account deactivated. Callers must
 * treat the identity as signed out; it is never re-provisioned automatically.
 */
export class ClerkIdentityRetiredError extends Error {
  readonly code = 'CLERK_IDENTITY_RETIRED';

  constructor(readonly clerkUserId: string) {
    super('Clerk account is inactive.');
    this.name = 'ClerkIdentityRetiredError';
  }
}

const USER_COLUMNS = `id, public_key, email, display_name, role, clerk_user_id, is_active`;

/**
 * Feature detection for migration 058. Deploys may reach production before
 * `pnpm db:migrate` runs, so identity paths must keep working without the new
 * tables. A positive result is cached for the process lifetime; a negative
 * result is re-checked after a minute so the features switch on once migrated.
 */
type LifecycleSchema = { tombstones: boolean; deliveries: boolean; sourceUpdatedAt: boolean };
let lifecycleSchemaCache: { value: LifecycleSchema; checkedAt: number } | null = null;
const LIFECYCLE_SCHEMA_RECHECK_MS = 60_000;

export async function identityLifecycleSchema(): Promise<LifecycleSchema> {
  const cached = lifecycleSchemaCache;
  const complete = cached && cached.value.tombstones && cached.value.deliveries && cached.value.sourceUpdatedAt;
  if (cached && (complete || Date.now() - cached.checkedAt < LIFECYCLE_SCHEMA_RECHECK_MS)) return cached.value;

  try {
    const result = await getPool().query(
      `SELECT to_regclass('public.clerk_identity_tombstones') IS NOT NULL AS tombstones,
              to_regclass('public.clerk_webhook_deliveries') IS NOT NULL AS deliveries,
              EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'clerk_source_updated_at'
              ) AS source_updated_at`
    );
    const row = result.rows[0] || {};
    const value = {
      tombstones: row.tombstones === true,
      deliveries: row.deliveries === true,
      sourceUpdatedAt: row.source_updated_at === true,
    };
    lifecycleSchemaCache = { value, checkedAt: Date.now() };
    return value;
  } catch (error) {
    console.error('Identity lifecycle schema detection failed:', error);
    return { tombstones: false, deliveries: false, sourceUpdatedAt: false };
  }
}

/** Test hook: forget cached schema detection. */
export function resetIdentityLifecycleSchemaCache() {
  lifecycleSchemaCache = null;
}

async function isClerkIdentityTombstoned(clerkUserId: string, schema: LifecycleSchema): Promise<boolean> {
  if (!schema.tombstones) return false;
  const result = await getPool().query(
    `SELECT 1 FROM clerk_identity_tombstones WHERE clerk_user_id = $1 LIMIT 1`,
    [clerkUserId]
  );
  return Boolean(result.rows[0]);
}

function validSourceUpdatedAt(value: Date | null | undefined): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
}

function mapRow(row: Record<string, any>): ClerkMappedUser {
  return {
    id: row.id,
    did: row.public_key || undefined,
    email: row.email || undefined,
    name: row.display_name || row.email?.split('@')[0] || undefined,
    role: row.role === 'admin' ? 'admin' : 'user',
    clerkUserId: row.clerk_user_id,
  };
}

function normalizeDisplayName(snapshot: ClerkUserSnapshot): string | null {
  const name = snapshot.displayName?.trim();
  if (name) return name.slice(0, 255);
  if (snapshot.email) return snapshot.email.split('@')[0].slice(0, 255);
  return null;
}

/**
 * Create or link an OxSig user for a Clerk identity.
 *
 * OxSig's UUID remains the primary relational identity. If a verified Clerk
 * email matches exactly one unlinked legacy account, that account is linked
 * instead of creating a duplicate. Ambiguous matches are never auto-linked.
 */
export async function upsertClerkUser(snapshot: ClerkUserSnapshot): Promise<ClerkMappedUser> {
  const pool = getPool();
  const schema = await identityLifecycleSchema();
  if (await isClerkIdentityTombstoned(snapshot.clerkUserId, schema)) {
    throw new ClerkIdentityRetiredError(snapshot.clerkUserId);
  }
  const sourceUpdatedAt = schema.sourceUpdatedAt ? validSourceUpdatedAt(snapshot.sourceUpdatedAt) : null;

  const existing = await pool.query(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE clerk_user_id = $1
     LIMIT 1`,
    [snapshot.clerkUserId]
  );

  const displayName = normalizeDisplayName(snapshot);
  const email = snapshot.email?.trim().toLowerCase() || null;
  const avatarUrl = snapshot.avatarUrl?.trim() || null;

  if (existing.rows[0] && existing.rows[0].is_active !== true) {
    throw new ClerkIdentityRetiredError(snapshot.clerkUserId);
  }

  if (existing.rows[0]) {
    // Webhooks can arrive out of order. When the snapshot carries Clerk's
    // updated_at, an older snapshot must not overwrite a newer one.
    const orderingGuard = sourceUpdatedAt
      ? `AND (clerk_source_updated_at IS NULL OR clerk_source_updated_at <= $6)`
      : '';
    const orderingSet = sourceUpdatedAt ? `clerk_source_updated_at = $6,` : '';
    const params: unknown[] = [snapshot.clerkUserId, email, !!snapshot.emailVerified, displayName, avatarUrl];
    if (sourceUpdatedAt) params.push(sourceUpdatedAt);

    const updated = await pool.query(
      `UPDATE users
       SET email = COALESCE($2, email),
           email_verified = CASE
             WHEN $2::text IS NULL THEN email_verified
             ELSE $3::boolean
           END,
           display_name = COALESCE(display_name, $4),
           avatar_url = COALESCE(avatar_url, $5),
           auth_provider = 'clerk',
           ${orderingSet}
           clerk_synced_at = NOW(),
           last_seen_at = NOW(),
           updated_at = NOW()
       WHERE clerk_user_id = $1 AND is_active = true
       ${orderingGuard}
       RETURNING ${USER_COLUMNS}`,
      params
    );
    if (updated.rows[0]) return mapRow(updated.rows[0]);

    // Either the snapshot was stale (row unchanged) or the account was
    // deactivated between the SELECT and the UPDATE.
    const current = await pool.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE clerk_user_id = $1 AND is_active = true LIMIT 1`,
      [snapshot.clerkUserId]
    );
    if (current.rows[0]) return mapRow(current.rows[0]);
    throw new ClerkIdentityRetiredError(snapshot.clerkUserId);
  }

  // Link a legacy account only when Clerk has verified the email and the match
  // is unambiguous. This prevents account takeover through an unverified email.
  if (email && snapshot.emailVerified) {
    const candidates = await pool.query(
      `SELECT id
       FROM users
       WHERE clerk_user_id IS NULL
         AND is_active = true
         AND LOWER(email) = LOWER($1)
       ORDER BY created_at ASC
       LIMIT 2`,
      [email]
    );

    if (candidates.rows.length === 1) {
      const linked = await pool.query(
        `UPDATE users
         SET clerk_user_id = $1,
             email = $2,
             email_verified = true,
             display_name = COALESCE(display_name, $3),
             avatar_url = COALESCE(avatar_url, $4),
             auth_provider = 'clerk',
             clerk_deleted_at = NULL,
             clerk_synced_at = NOW(),
             last_seen_at = NOW(),
             updated_at = NOW()
         WHERE id = $5 AND clerk_user_id IS NULL AND is_active = true
         RETURNING ${USER_COLUMNS}`,
        [snapshot.clerkUserId, email, displayName, avatarUrl, candidates.rows[0].id]
      );
      if (linked.rows[0]) return mapRow(linked.rows[0]);
    }
  }

  const created = await pool.query(
    `INSERT INTO users (
       clerk_user_id, email, email_verified, display_name, avatar_url,
       auth_provider, is_active, clerk_synced_at, last_login_at, last_seen_at
     )
     VALUES ($1, $2, $3, $4, $5, 'clerk', true, NOW(), NOW(), NOW())
     ON CONFLICT (clerk_user_id) WHERE clerk_user_id IS NOT NULL DO NOTHING
     RETURNING ${USER_COLUMNS}`,
    [snapshot.clerkUserId, email, !!snapshot.emailVerified, displayName, avatarUrl]
  );

  if (created.rows[0]) {
    // Close the race with a concurrent user.deleted: if the identity was
    // tombstoned while this row was being inserted, retire the new row.
    if (await isClerkIdentityTombstoned(snapshot.clerkUserId, schema)) {
      await deactivateUserRowsForClerkIdentity(snapshot.clerkUserId);
      throw new ClerkIdentityRetiredError(snapshot.clerkUserId);
    }
    if (sourceUpdatedAt) {
      await pool.query(`UPDATE users SET clerk_source_updated_at = $2 WHERE id = $1`, [created.rows[0].id, sourceUpdatedAt]);
    }
    return mapRow(created.rows[0]);
  }

  const raced = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE clerk_user_id=$1 AND is_active=true LIMIT 1`,
    [snapshot.clerkUserId]
  );
  if (raced.rows[0]) return mapRow(raced.rows[0]);
  throw new Error('Clerk account could not be linked safely.');
}


async function deactivateUserRowsForClerkIdentity(clerkUserId: string): Promise<number> {
  const result = await getPool().query(
    `UPDATE users
     SET is_active = false,
         clerk_deleted_at = NOW(),
         clerk_synced_at = NOW(),
         updated_at = NOW()
     WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
  return result.rowCount || 0;
}

/**
 * Retire a Clerk identity: record a tombstone (even when no OXSIG row exists
 * yet, e.g. user.deleted delivered before user.created) and deactivate the
 * account. Billable lab resources of deactivated accounts are reclaimed by the
 * scheduled cleanup sweep.
 */
export async function deactivateClerkUser(
  clerkUserId: string,
  source: ClerkIdentityRetirementSource = 'clerk_webhook'
): Promise<void> {
  const schema = await identityLifecycleSchema();
  if (schema.tombstones) {
    await getPool().query(
      `INSERT INTO clerk_identity_tombstones (clerk_user_id, source)
       VALUES ($1, $2)
       ON CONFLICT (clerk_user_id) DO NOTHING`,
      [clerkUserId, source]
    );
  }
  await deactivateUserRowsForClerkIdentity(clerkUserId);
}

/**
 * Resolve the active Clerk session to OxSig's internal UUID user.
 * A Backend API lookup occurs only when the Clerk identity has not yet been
 * mapped (for example before the first webhook delivery).
 */
export async function getClerkAuthenticatedUser(): Promise<ClerkMappedUser | null> {
  if (isE2EAuthEnabled()) return getE2EAuthenticatedUserFromCookies();
  if (!isClerkConfigured()) return null;

  const session = await auth();
  if (!session.isAuthenticated || !session.userId) return null;

  const mapped = await getPool().query(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE clerk_user_id = $1 AND is_active = true
     LIMIT 1`,
    [session.userId]
  );

  if (mapped.rows[0]) {
    void getPool().query(
      `UPDATE users SET last_seen_at = NOW(), last_login_at = NOW() WHERE id = $1`,
      [mapped.rows[0].id]
    ).catch((error) => console.error('Failed to update Clerk user activity:', error));
    return mapRow(mapped.rows[0]);
  }

  const inactive = await getPool().query(
    `SELECT 1 FROM users WHERE clerk_user_id=$1 AND is_active=false LIMIT 1`,
    [session.userId]
  );
  if (inactive.rows[0]) return null;

  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== session.userId) return null;

  const primaryEmail =
    clerkUser.emailAddresses.find((address) => address.id === clerkUser.primaryEmailAddressId) ||
    clerkUser.emailAddresses[0];

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim() ||
    clerkUser.username ||
    null;

  try {
    return await upsertClerkUser({
      clerkUserId: clerkUser.id,
      email: primaryEmail?.emailAddress || null,
      emailVerified: primaryEmail?.verification?.status === 'verified',
      displayName,
      avatarUrl: clerkUser.imageUrl || null,
      sourceUpdatedAt: typeof clerkUser.updatedAt === 'number' ? new Date(clerkUser.updatedAt) : null,
    });
  } catch (error) {
    // A retired identity with a still-valid session is signed out, not 503.
    if (error instanceof ClerkIdentityRetiredError) return null;
    throw error;
  }
}
