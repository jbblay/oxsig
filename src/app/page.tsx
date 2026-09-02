import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import ClerkEntry from '@/components/auth/clerk-entry';
import LegacyAuthEntry from '@/components/auth/legacy-entry';
import { isClerkConfigured } from '@/lib/auth/clerk-config';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const clerkEnabled = isClerkConfigured();

  if (clerkEnabled) {
    const { isAuthenticated } = await auth();
    if (isAuthenticated) {
      redirect('/home');
    }

    return <ClerkEntry />;
  }

  return <LegacyAuthEntry />;
}
