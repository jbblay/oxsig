'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileSignature, Home, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  { label: 'Home', href: '/home', icon: Home },
  { label: 'Sign', href: '/sign', icon: FileSignature },
  { label: 'Profile', href: '/profile', icon: User },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur sm:hidden" aria-label="Mobile navigation">
      <div className="grid grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-2 text-xs',
              pathname === link.href ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <link.icon className="h-5 w-5" aria-hidden="true" />
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
