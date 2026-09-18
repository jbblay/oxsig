import type { ReactNode } from 'react';
import { getServerAuthState } from '@/lib/auth/server-auth';
import GuestProductSurface from '@/components/auth/GuestProductSurface';

export const dynamic = 'force-dynamic';

export default async function LabsLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = await getServerAuthState();
  if (!isAuthenticated) return <GuestProductSurface surface="labs" />;
  return <>{children}</>;
}
