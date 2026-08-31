'use client';

import { usePathname } from 'next/navigation';
import TopNav from '@/components/app/TopNav';
import MobileNav from '@/components/app/MobileNav';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/';

  if (isAuthPage) return <main className="min-h-svh">{children}</main>;

  return (
    <div className="min-h-svh bg-background">
      <TopNav />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
