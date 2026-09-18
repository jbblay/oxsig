import { redirect } from 'next/navigation';
import { getServerAuthState } from '@/lib/auth/server-auth';
import ClerkEntry from '@/components/auth/clerk-entry';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { isAuthenticated } = await getServerAuthState();
  if (isAuthenticated) redirect('/home');
  return <ClerkEntry />;
}
