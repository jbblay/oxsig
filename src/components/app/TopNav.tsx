'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Box, HardDrive, Home, LogIn, LogOut, Moon, Sun, User, Users } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/use-auth';

const links = [
  { href: '/collab/storyboards', label: 'Boards', icon: BookOpen },
  { href: '/collab', label: 'Collaborate', icon: Users },
  { href: '/storage', label: 'Storage', icon: HardDrive },
  { href: '/labs', label: 'Lab', icon: Box },
];

export default function TopNav() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-6">
          <Link href="/home" className="flex items-center gap-2 font-semibold">
            <Home className="h-5 w-5" /> Oxsig
          </Link>
          <nav className="hidden items-center gap-5 md:flex">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={cn('flex items-center gap-1.5 text-sm', pathname.startsWith(href) ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-4 w-4" />{label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
            <Sun className="h-5 w-5 dark:hidden" /><Moon className="hidden h-5 w-5 dark:block" />
          </Button>
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><User className="h-5 w-5" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild><Link href="/account">{user?.displayName || user?.email || 'Account'}</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={(event) => { event.preventDefault(); void logout(); }}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="ghost" size="sm"><Link href="/sign-in"><LogIn className="mr-2 h-4 w-4" />Sign in</Link></Button>
          )}
        </div>
      </div>
    </header>
  );
}
