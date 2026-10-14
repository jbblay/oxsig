import 'server-only';

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { isProductionDeployment } from '@/lib/runtime/deployment-environment';
import {
  E2E_AUTH_ACCOUNTS,
  E2E_AUTH_COOKIE,
  isE2EAuthAccountKey,
  type E2EAuthAccountKey,
} from './e2e-auth-contract';

export function isE2EAuthEnabled(): boolean {
  if (process.env.OXSIG_E2E_AUTH_ENABLED !== 'true') return false;
  if (process.env.NODE_ENV === 'production' || isProductionDeployment()) {
    throw new Error('OXSIG_E2E_AUTH_ENABLED is forbidden in production.');
  }
  return true;
}

async function resolveE2EUser(key: E2EAuthAccountKey | null) {
  if (!key) return null;
  const account = E2E_AUTH_ACCOUNTS[key];

  await getPool().query(
    `INSERT INTO users (
       id, public_key, display_name, email, is_active, role,
       auth_provider, clerk_user_id, email_verified
     )
     VALUES ($1, $2, $3, $4, true, 'user', 'clerk', $5, true)
     ON CONFLICT (id) DO UPDATE
     SET public_key = EXCLUDED.public_key,
         display_name = EXCLUDED.display_name,
         email = EXCLUDED.email,
         is_active = true,
         role = 'user',
         auth_provider = 'clerk',
         clerk_user_id = EXCLUDED.clerk_user_id,
         email_verified = true,
         updated_at = NOW()`,
    [account.userId, `e2e:${key}`, account.name, account.email, account.identityId]
  );

  return {
    id: account.userId,
    clerkUserId: account.identityId,
    email: account.email,
    name: account.name,
    role: 'user' as const,
    isFounder: false,
    suspendedAt: null,
    suspendedReason: null,
  };
}

export async function getE2EAuthenticatedUser(request: NextRequest) {
  if (!isE2EAuthEnabled()) return null;
  const rawKey = request.cookies.get(E2E_AUTH_COOKIE)?.value;
  return resolveE2EUser(isE2EAuthAccountKey(rawKey) ? rawKey : null);
}

export async function getE2EAuthenticatedUserFromCookies() {
  if (!isE2EAuthEnabled()) return null;
  const cookieStore = await cookies();
  const rawKey = cookieStore.get(E2E_AUTH_COOKIE)?.value;
  return resolveE2EUser(isE2EAuthAccountKey(rawKey) ? rawKey : null);
}
