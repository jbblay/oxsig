import type { ReactNode } from 'react';
import AcademyPersistenceBridge from '@/components/academy/AcademyPersistenceBridge';
import { getAcademyState } from '@/lib/academy/persistence';
import { getClerkAuthenticatedUser } from '@/lib/auth/clerk-user';

export const dynamic = 'force-dynamic';

export default async function AcademyLayout({ children }: { children: ReactNode }) {
  let initialState = null;
  try {
    const user = await getClerkAuthenticatedUser();
    if (user) initialState = await getAcademyState(user.id);
  } catch (error) {
    console.warn('Academy durable state preload failed:', error);
  }

  return (
    <>
      <AcademyPersistenceBridge initialState={initialState} />
      {children}
    </>
  );
}
