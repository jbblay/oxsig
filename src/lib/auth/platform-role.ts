/**
 * Platform role resolution.
 *
 * `users.role` in Postgres is the durable source of truth. Founders are
 * bootstrapped through OXSIG_FOUNDER_EMAILS so the platform owner never needs
 * to run SQL to reach the admin console. A founder email only grants admin when
 * the identity provider has verified that email, which prevents takeover via an
 * unverified sign-up using the founder's address.
 */

export type PlatformRole = 'user' | 'admin';

export interface PlatformRoleInput {
  role?: string | null;
  email?: string | null;
  email_verified?: boolean | null;
}

export function founderEmails(raw: string | undefined = process.env.OXSIG_FOUNDER_EMAILS): string[] {
  if (!raw) return [];
  return [...new Set<string>(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 3 && value.includes('@')),
  )];
}

export function isFounderIdentity(input: PlatformRoleInput, emails = founderEmails()): boolean {
  if (!input.email || input.email_verified !== true) return false;
  return emails.includes(input.email.trim().toLowerCase());
}

export function resolvePlatformRole(input: PlatformRoleInput, emails = founderEmails()): PlatformRole {
  if (input.role === 'admin') return 'admin';
  return isFounderIdentity(input, emails) ? 'admin' : 'user';
}
