'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Box,
  Home,
  LibraryBig,
  MessageCircle,
  RadioTower,
  Search,
  Settings2,
  UserRound,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const destinations = [
  { href: '/home', label: 'Dashboard', icon: Home },
  { href: '/labs', label: 'Cyber Lab', icon: Box },
  { href: '/collab', label: 'Collaboration', icon: MessageCircle },
  { href: '/live', label: 'Live Workspace', icon: RadioTower },
  { href: '/collab/storyboards', label: 'Boards', icon: BookOpen },
  { href: '/vault', label: 'Vault', icon: LibraryBig },
  { href: '/manage', label: 'Resources', icon: Settings2 },
  { href: '/account', label: 'Account', icon: UserRound },
];

export default function AppCommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  const filtered = destinations.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));

  function navigate(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Go to</DialogTitle>
        <div className="relative border-b">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && filtered[0]) navigate(filtered[0].href);
            }}
            placeholder="Go to…"
            className="h-12 rounded-none border-0 pl-11 pr-12 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No match</div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => navigate(item.href)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="h-4 w-4" /></span>
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
