'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FileSignature, Home, LogOut, Moon, Shield, Sun, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';
import { cn } from '@/lib/utils';

const links = [
  { label: 'Home', href: '/home', icon: Home },
  { label: 'Sign', href: '/sign', icon: FileSignature },
  { label: 'Profile', href: '/profile', icon: User },
];

export default function TopNav() {
  const { resolvedTheme, setTheme } = useTheme();
  const { logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/home" className="flex items-center gap-2 font-semibold">
            <Shield className="h-5 w-5" aria-hidden="true" /> OxSig
          </Link>
          <nav className="hidden items-center gap-5 text-sm sm:flex" aria-label="Primary navigation">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-1.5 transition-colors hover:text-foreground',
                  pathname === link.href ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <link.icon className="h-4 w-4" aria-hidden="true" /> {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle color theme"
          >
            {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={() => void logout().finally(() => router.push('/'))}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
