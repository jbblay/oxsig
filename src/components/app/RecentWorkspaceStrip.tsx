'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Home, LibraryBig, MessageCircle, RadioTower, Settings2, Terminal } from 'lucide-react';
import { useAuth } from '@/lib/auth/use-auth';
import { resolveProductPathHref } from '@/lib/navigation/product-navigation';
import {
  getWorkspaceRecents,
  subscribeWorkspaceActivity,
  type WorkspaceRecent,
} from '@/lib/persistence/workspace-activity';

const icons = {
  home: Home,
  labs: Terminal,
  live: RadioTower,
  collab: MessageCircle,
  boards: BookOpen,
  vault: LibraryBig,
  manage: Settings2,
} as const;

function relativeTime(value: number) {
  const minutes = Math.floor(Math.max(0, Date.now() - value) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function RecentWorkspaceStrip() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [items, setItems] = React.useState<WorkspaceRecent[]>([]);
  const refresh = React.useCallback(() => {
    setItems(getWorkspaceRecents().filter((item) => item.href !== '/home').slice(0, 4));
  }, []);

  React.useEffect(() => {
    refresh();
    return subscribeWorkspaceActivity(refresh);
  }, [refresh]);

  if (items.length === 0) return null;
  const signedInForNavigation = !authLoading && isAuthenticated;

  return (
    <section className="rounded-lg border bg-card/55 p-2.5" aria-labelledby="recent-work-title">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 id="recent-work-title" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Resume</h2>
        <span className="text-[10px] text-muted-foreground">Recent work</span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = icons[item.color];
          const href = resolveProductPathHref(item.href, signedInForNavigation);
          const content = (
            <>
              <span className="oxsig-workspace-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-md"><Icon className="h-3.5 w-3.5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{item.label}</span>
                <span className="block text-[10px] text-muted-foreground">{relativeTime(item.at)} ago</span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </>
          );

          if (!href) {
            return (
              <button key={item.href} type="button" disabled aria-disabled="true" data-workspace-color={item.color} className="flex min-w-0 cursor-not-allowed items-center gap-2 rounded-md border border-transparent px-2 py-2 opacity-45">
                {content}
              </button>
            );
          }

          return (
            <Link key={item.href} href={href} data-workspace-color={item.color} className="group flex min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-2 transition hover:border-border hover:bg-muted/35">
              {content}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
