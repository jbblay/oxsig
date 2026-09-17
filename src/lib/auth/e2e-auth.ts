import 'server-only';

import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/pool';
import {
  E2E_AUTH_ACCOUNTS,
  E2E_AUTH_COOKIE,
  isE2EAuthAccountKey,
} from './e2e-auth-contract';

export function isE2EAuthEnabled(): boolean {
  if (process.env.OXSIG_E2E_AUTH_ENABLED !== 'true') return false;
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    throw new Error('OXSIG_E2E_AUTH_ENABLED is forbidden in production.');
  }
  return true;
}

export async function getE2EAuthenticatedUser(request: NextRequest) {
  if (!isE2EAuthEnabled()) return null;

  const key = request.cookies.get(E2E_AUTH_COOKIE)?.value;
  if (!isE2EAuthAccountKey(key)) return null;
  const account = E2E_AUTH_ACCOUNTS[key];

  await getPool().query(
    `INSERT INTO users (id, public_key, display_name, email, is_active, role)
     VALUES ($1, $2, $3, $4, true, 'user')
     ON CONFLICT (id) DO UPDATE
     SET public_key = EXCLUDED.public_key,
         display_name = EXCLUDED.display_name,
         email = EXCLUDED.email,
         is_active = true,
         role = 'user',
         updated_at = NOW()`,
    [account.userId, `e2e:${key}`, account.name, account.email]
  );

  return {
    id: account.userId,
    clerkUserId: account.identityId,
    email: account.email,
    name: account.name,
    role: 'user' as const,
  };
}
