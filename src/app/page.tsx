import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import LegacyAuthEntry from '@/components/auth/legacy-entry';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const clerkEnabled = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );

  if (clerkEnabled) {
    const { isAuthenticated } = await auth();
    redirect(isAuthenticated ? '/home' : '/sign-in');
  }

  return <LegacyAuthEntry />;
}
