import type { ReactNode } from 'react';
import { getServerAuthState } from '@/lib/auth/server-auth';
import AcademyNavigation from '@/components/academy/AcademyNavigation';
import AcademyDurableStateProvider from '@/components/academy/AcademyDurableStateProvider';
import GuestProductSurface from '@/components/auth/GuestProductSurface';
import { getAcademyState } from '@/lib/academy/persistence';
import { getClerkAuthenticatedUser } from '@/lib/auth/clerk-user';

export const dynamic = 'force-dynamic';

export default async function AcademyLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = await getServerAuthState();
  if (!isAuthenticated) return <GuestProductSurface surface="academy" />;

  let initialState = null;
  try {
    const user = await getClerkAuthenticatedUser();
    if (user) initialState = await getAcademyState(user.id);
  } catch (error) {
    console.warn('Academy durable state preload failed:', error);
  }

  return (
    <AcademyDurableStateProvider initialState={initialState}>
      <div className="space-y-3">
        <AcademyNavigation />
        {children}
      </div>
    </AcademyDurableStateProvider>
  );
}
