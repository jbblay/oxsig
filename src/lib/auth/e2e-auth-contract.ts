export const E2E_AUTH_COOKIE = 'oxsig-e2e-user';

export const E2E_AUTH_ACCOUNTS = {
  'account-a': {
    userId: '00000000-0000-4000-8000-0000000000a1',
    identityId: 'e2e-account-a',
    email: 'e2e-account-a@oxsig.test',
    name: 'E2E Account A',
  },
  'account-b': {
    userId: '00000000-0000-4000-8000-0000000000b2',
    identityId: 'e2e-account-b',
    email: 'e2e-account-b@oxsig.test',
    name: 'E2E Account B',
  },
} as const;

export type E2EAuthAccountKey = keyof typeof E2E_AUTH_ACCOUNTS;

export function isE2EAuthAccountKey(value: string | null | undefined): value is E2EAuthAccountKey {
  return !!value && Object.prototype.hasOwnProperty.call(E2E_AUTH_ACCOUNTS, value);
}

export function readE2EAuthAccountKey(cookieString: string): E2EAuthAccountKey | null {
  const prefix = `${E2E_AUTH_COOKIE}=`;
  const raw = cookieString
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  const decoded = raw ? decodeURIComponent(raw) : null;
  return isE2EAuthAccountKey(decoded) ? decoded : null;
}
