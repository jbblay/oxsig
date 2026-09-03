import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import ClerkEntry from '@/components/auth/clerk-entry';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { isAuthenticated } = await auth();
  if (isAuthenticated) redirect('/home');
  return <ClerkEntry />;
}
