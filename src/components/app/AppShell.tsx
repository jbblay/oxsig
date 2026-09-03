'use client';

import { usePathname } from 'next/navigation';
import MobileNav from './MobileNav';
import TopNav from './TopNav';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = pathname === '/' || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up');

  if (bare) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 md:px-8 md:pb-8">{children}</main>
      <MobileNav />
    </div>
  );
}
