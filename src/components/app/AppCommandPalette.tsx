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
  { href: '/home', label: 'Dashboard', icon: Home, color: 'home' },
  { href: '/labs', label: 'Cyber Lab', icon: Box, color: 'labs' },
  { href: '/collab', label: 'Collaboration', icon: MessageCircle, color: 'collab' },
  { href: '/live', label: 'Live Workspace', icon: RadioTower, color: 'live' },
  { href: '/collab/storyboards', label: 'Boards', icon: BookOpen, color: 'boards' },
  { href: '/vault', label: 'Vault', icon: LibraryBig, color: 'vault' },
  { href: '/manage', label: 'Resources', icon: Settings2, color: 'manage' },
  { href: '/account', label: 'Account', icon: UserRound, color: 'home' },
] as const;

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
      <DialogContent className="w-[calc(100%_-_1rem)] max-w-md gap-0 overflow-hidden rounded-xl p-0">
        <DialogTitle className="sr-only">Go to</DialogTitle>
        <div className="relative border-b">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && filtered[0]) navigate(filtered[0].href);
            }}
            placeholder="Go to…"
            className="h-10 rounded-none border-0 pl-9 pr-10 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">No match</div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  type="button"
                  data-workspace-color={item.color}
                  onClick={() => navigate(item.href)}
                  className="group flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="oxsig-workspace-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-md"><Icon className="h-3.5 w-3.5" /></span>
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
