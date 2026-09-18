import type { ReactNode } from 'react';
import { getServerAuthState } from '@/lib/auth/server-auth';
import GuestProductSurface from '@/components/auth/GuestProductSurface';

export const dynamic = 'force-dynamic';

export default async function WarRoomLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = await getServerAuthState();
  if (!isAuthenticated) return <GuestProductSurface surface="warroom" />;
  return <>{children}</>;
}
