'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Box, HardDrive, Home, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/collab/storyboards', label: 'Boards', icon: BookOpen },
  { href: '/storage', label: 'Storage', icon: HardDrive },
  { href: '/labs', label: 'Lab', icon: Box },
  { href: '/account', label: 'Account', icon: User },
];

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn('flex flex-col items-center gap-1 px-1 py-2 text-[11px]', pathname.startsWith(href) ? 'text-foreground' : 'text-muted-foreground')}>
            <Icon className="h-5 w-5" />{label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
