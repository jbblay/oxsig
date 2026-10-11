import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { getPool } from '@/lib/db/pool';
import { isClerkConfigured } from './clerk-config';
import { AccountSuspendedError } from './account-status';
import { isFounderIdentity, resolvePlatformRole } from './platform-role';
import { getE2EAuthenticatedUserFromCookies, isE2EAuthEnabled } from './e2e-auth';

export interface ClerkMappedUser {
  id: string;
  did?: string;
  email?: string;
  name?: string;
  role: 'user' | 'admin';
  isFounder: boolean;
  clerkUserId: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
}

export interface ClerkUserSnapshot {
  clerkUserId: string;
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
  avatarUrl?: string | null;
}

// Suspension columns are read through to_jsonb so identity resolution keeps
// working during the window between a deploy and `pnpm db:migrate`.
const USER_COLUMNS = `id, public_key, email, email_verified, display_name, role, clerk_user_id, is_active,
  to_jsonb(users) ->> 'suspended_at' AS suspended_at,
  to_jsonb(users) ->> 'suspended_reason' AS suspended_reason`;

function mapRow(row: Record<string, any>): ClerkMappedUser {
  return {
    id: row.id,
    did: row.public_key || undefined,
    email: row.email || undefined,
    name: row.display_name || row.email?.split('@')[0] || undefined,
    role: resolvePlatformRole(row),
    isFounder: isFounderIdentity(row),
    clerkUserId: row.clerk_user_id,
    suspendedAt: row.suspended_at || null,
    suspendedReason: row.suspended_reason || null,
  };
}

function assertNotSuspended(user: ClerkMappedUser): ClerkMappedUser {
  if (user.suspendedAt) throw new AccountSuspendedError(user.suspendedReason);
  return user;
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
    throw new Error('Clerk account is inactive.');
  }

  if (existing.rows[0]) {
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
           clerk_synced_at = NOW(),
           last_seen_at = NOW(),
           updated_at = NOW()
       WHERE clerk_user_id = $1 AND is_active = true
       RETURNING ${USER_COLUMNS}`,
      [snapshot.clerkUserId, email, !!snapshot.emailVerified, displayName, avatarUrl]
    );
    return mapRow(updated.rows[0]);
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

  if (created.rows[0]) return mapRow(created.rows[0]);

  const raced = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE clerk_user_id=$1 AND is_active=true LIMIT 1`,
    [snapshot.clerkUserId]
  );
  if (raced.rows[0]) return mapRow(raced.rows[0]);
  throw new Error('Clerk account could not be linked safely.');
}


export async function deactivateClerkUser(clerkUserId: string): Promise<void> {
  await getPool().query(
    `UPDATE users
     SET is_active = false,
         clerk_deleted_at = NOW(),
         clerk_synced_at = NOW(),
         updated_at = NOW()
     WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
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
    return assertNotSuspended(mapRow(mapped.rows[0]));
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

  const synced = await upsertClerkUser({
    clerkUserId: clerkUser.id,
    email: primaryEmail?.emailAddress || null,
    emailVerified: primaryEmail?.verification?.status === 'verified',
    displayName,
    avatarUrl: clerkUser.imageUrl || null,
  });
  return assertNotSuspended(synced);
}
