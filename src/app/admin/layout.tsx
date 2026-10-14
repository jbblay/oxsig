import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getClerkAuthenticatedUser } from '@/lib/auth/clerk-user';
import { getServerAuthState } from '@/lib/auth/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Platform console · OXSIG',
  robots: { index: false, follow: false },
};

/**
 * The console is invisible to everyone except platform admins: guests,
 * regular users and suspended accounts get a plain 404 rather than a hint
 * that an admin surface exists. Every API call is independently re-authorised.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = await getServerAuthState();
  if (!isAuthenticated) notFound();

  let role: string | null = null;
  try {
    role = (await getClerkAuthenticatedUser())?.role ?? null;
  } catch {
    role = null;
  }
  if (role !== 'admin') notFound();

  return <>{children}</>;
}
