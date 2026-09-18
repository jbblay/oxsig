import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import {
  E2E_AUTH_ACCOUNTS,
  E2E_AUTH_COOKIE,
  isE2EAuthAccountKey,
} from './e2e-auth-contract';
import { isE2EAuthEnabled } from './e2e-auth';

export async function getServerAuthState() {
  if (isE2EAuthEnabled()) {
    const cookieStore = await cookies();
    const rawKey = cookieStore.get(E2E_AUTH_COOKIE)?.value;
    const account = isE2EAuthAccountKey(rawKey) ? E2E_AUTH_ACCOUNTS[rawKey] : null;

    return {
      isAuthenticated: Boolean(account),
      userId: account?.identityId ?? null,
    };
  }

  const session = await auth();
  return {
    isAuthenticated: session.isAuthenticated,
    userId: session.userId ?? null,
  };
}
