'use client';

import { usePathname } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import TopNav from '@/components/app/TopNav';
import MobileNav from '@/components/app/MobileNav';
import { useAuth } from '@/lib/auth/use-auth';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAuthPage = pathname === '/';

  if (isAuthPage) return <main className="min-h-svh">{children}</main>;

  return (
    <div className="min-h-svh bg-background">
      <TopNav />
      {user?.role === 'demo' && (
        <div className="border-b border-amber-500/30 bg-amber-500/10">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 sm:px-6 lg:px-8">
            <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span><strong>Demo workspace:</strong> explore freely; saving and uploads are disabled.</span>
          </div>
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
