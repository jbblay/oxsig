'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Box,
  Command,
  Crosshair,
  GraduationCap,
  Home,
  LibraryBig,
  MessageCircle,
  Play,
  RadioTower,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Swords,
  UserRound,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth/use-auth';
import { resolveProductPathHref } from '@/lib/navigation/product-navigation';
import {
  getWorkspaceRecents,
  recordWorkspaceActivity,
  type WorkspaceColor,
} from '@/lib/persistence/workspace-activity';

const destinations = [
  { href: '/home', label: 'Dashboard', hint: 'Open workspace dashboard', icon: Home, color: 'home' },
  { href: '/academy', label: 'Academy', hint: 'Learning paths and capability evidence', icon: GraduationCap, color: 'home' },
  { href: '/operations', label: 'Operations', hint: 'Preconfigured technical scenarios', icon: Crosshair, color: 'labs' },
  { href: '/warroom', label: 'WarRoom', hint: '2–4 player team lab', icon: Swords, color: 'live' },
  { href: '/labs', label: 'Cyber Lab', hint: 'Build, run and review', icon: Box, color: 'labs' },
  { href: '/collab', label: 'Collaboration', hint: 'Messages and people', icon: MessageCircle, color: 'collab' },
  { href: '/live', label: 'Live Workspace', hint: 'Shared technical session', icon: RadioTower, color: 'live' },
  { href: '/collab/storyboards', label: 'Boards', hint: 'Draw and explain', icon: BookOpen, color: 'boards' },
  { href: '/vault', label: 'Vault', hint: 'Reusable technical knowledge', icon: LibraryBig, color: 'vault' },
  { href: '/manage', label: 'Resources', hint: 'Manage work', icon: Settings2, color: 'manage' },
  { href: '/account', label: 'Account', hint: 'Profile and achievements', icon: UserRound, color: 'home' },
] as const;

type PaletteItem = {
  id: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  color: WorkspaceColor;
  type: 'action' | 'destination';
  run: () => void;
  keywords: string;
};

export default function AppCommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const signedInForNavigation = !authLoading && isAuthenticated;

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  function navigate(href: string, label?: string, color: WorkspaceColor = 'home') {
    const destination = resolveProductPathHref(href, signedInForNavigation);
    if (!destination) return;

    onOpenChange(false);
    if (label) {
      recordWorkspaceActivity({ label, detail: 'Command palette', href: destination, color, kind: 'action' });
    }
    router.push(destination);
  }

  function openAi() {
    if (!signedInForNavigation) return;
    onOpenChange(false);
    recordWorkspaceActivity({ label: 'Opened AI Helper', detail: 'Global command', color: 'home', kind: 'action' });
    window.dispatchEvent(new CustomEvent('oxsig:ai-helper:open'));
  }

  const recent = getWorkspaceRecents().find((item) => item.href !== '/home');
  const recentDestination = recent ? resolveProductPathHref(recent.href, signedInForNavigation) : null;

  const authenticatedActions: PaletteItem[] = signedInForNavigation ? [
    {
      id: 'action-ai',
      label: 'Ask AI in current context',
      hint: 'Open AI Helper without leaving your workspace',
      icon: Sparkles,
      color: 'home',
      type: 'action',
      run: openAi,
      keywords: 'ask ai helper explain diagnose fix summarize operator',
    },
    {
      id: 'action-warroom',
      label: 'Open WarRoom',
      hint: 'Start a 2–4 player team lab',
      icon: Swords,
      color: 'live',
      type: 'action',
      run: () => navigate('/warroom', 'Opened WarRoom from command palette', 'live'),
      keywords: 'warroom team multiplayer shared terminal challenge',
    },
    {
      id: 'action-lab',
      label: 'Start or resume Cyber Lab',
      hint: 'Jump directly into lab operations',
      icon: Play,
      color: 'labs',
      type: 'action',
      run: () => navigate('/labs', 'Opened Cyber Lab from command palette', 'labs'),
      keywords: 'start run resume terminal cyber lab',
    },
    {
      id: 'action-board',
      label: 'Open Board workspace',
      hint: 'Draw, record, share or secure a board',
      icon: BookOpen,
      color: 'boards',
      type: 'action',
      run: () => navigate('/collab/storyboards', 'Opened Boards from command palette', 'boards'),
      keywords: 'new board draw diagram explain storyboard',
    },
    {
      id: 'action-vault',
      label: 'Capture knowledge in Vault',
      hint: 'Create or reuse commands, scripts and playbooks',
      icon: LibraryBig,
      color: 'vault',
      type: 'action',
      run: () => navigate('/vault', 'Opened Vault from command palette', 'vault'),
      keywords: 'save vault command script playbook knowledge proof',
    },
  ] : [];

  const visibleDestinations = destinations.filter((destination) => (
    Boolean(resolveProductPathHref(destination.href, signedInForNavigation))
  ));

  const items: PaletteItem[] = [
    {
      id: 'action-operation',
      label: signedInForNavigation ? 'Start an Operation' : 'Browse Operations',
      hint: signedInForNavigation ? 'Choose a preconfigured scenario and mode' : 'Browse mission dossiers without an account',
      icon: Crosshair,
      color: 'labs',
      type: 'action',
      run: () => navigate('/operations', 'Opened Operations from command palette', 'labs'),
      keywords: 'operation scenario mission active directory linux pentest forensics cloud challenge walkthrough',
    },
    ...authenticatedActions,
    ...(recent && recentDestination ? [{
      id: 'action-recent',
      label: `Resume ${recent.label}`,
      hint: signedInForNavigation ? 'Continue your most recent workspace' : 'Continue your most recent public browse page',
      icon: RotateCcw,
      color: recent.color,
      type: 'action' as const,
      run: () => navigate(recent.href, `Resumed ${recent.label}`, recent.color),
      keywords: 'recent resume continue last workspace',
    }] : []),
    ...visibleDestinations.map((destination) => ({
      id: `destination-${destination.href}`,
      label: destination.label,
      hint: destination.hint,
      icon: destination.icon,
      color: destination.color,
      type: 'destination' as const,
      run: () => navigate(destination.href),
      keywords: `${destination.label} ${destination.hint}`.toLowerCase(),
    })),
  ];

  const needle = query.trim().toLowerCase();
  const filtered = items.filter((item) => !needle || `${item.label} ${item.hint} ${item.keywords}`.toLowerCase().includes(needle));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%_-_1rem)] max-w-lg gap-0 overflow-hidden rounded-xl p-0">
        <DialogTitle className="sr-only">Commands and workspaces</DialogTitle>
        <div className="relative border-b">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && filtered[0]) filtered[0].run();
            }}
            placeholder="Search or run a command…"
            className="h-10 rounded-none border-0 pl-9 pr-10 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[390px] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">No matching command</div>
          ) : filtered.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                data-workspace-color={item.color}
                onClick={item.run}
                className="group flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="oxsig-workspace-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-md"><Icon className="h-3.5 w-3.5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{item.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{item.hint}</span>
                </span>
                <span className="flex h-5 shrink-0 items-center gap-1 rounded border bg-background px-1.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                  {item.type === 'action' && <Command className="h-2.5 w-2.5" />}{item.type}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
