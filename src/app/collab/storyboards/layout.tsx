import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';
import GuestProductSurface from '@/components/auth/GuestProductSurface';

export const dynamic = 'force-dynamic';

export default async function StoryboardsLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return <GuestProductSurface surface="boards" />;
  return <>{children}</>;
}
