'use client';

import * as React from 'react';
import { Bell, CheckCircle2, Clock3, ExternalLink, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  clearWorkspaceActivity,
  getWorkspaceActivity,
  subscribeWorkspaceActivity,
  type WorkspaceActivity,
} from '@/lib/persistence/workspace-activity';

function relativeTime(value: number) {
  const diff = Math.max(0, Date.now() - value);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function ActivityCenter() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<WorkspaceActivity[]>([]);

  const refresh = React.useCallback(() => setItems(getWorkspaceActivity()), []);

  React.useEffect(() => {
    refresh();
    return subscribeWorkspaceActivity(refresh);
  }, [refresh]);

  const openItem = (item: WorkspaceActivity) => {
    if (!item.href) return;
    setOpen(false);
    router.push(item.href);
  };

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="relative h-8 w-8"
        onClick={() => setOpen(true)}
        aria-label="Open activity center"
        title="Activity"
      >
        <Bell className="h-3.5 w-3.5" />
        {items.length > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-cyan-500" />}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%_-_1rem)] max-w-lg gap-0 overflow-hidden rounded-xl p-0">
          <DialogHeader className="border-b px-4 py-3 pr-12">
            <div className="flex items-center justify-between gap-3">
              <div>
                <DialogTitle className="text-sm">Activity center</DialogTitle>
                <DialogDescription className="mt-1 text-xs">Recent workspace and operational activity.</DialogDescription>
              </div>
              {items.length > 0 && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => { clearWorkspaceActivity(); refresh(); }}>
                  <Trash2 className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {items.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center text-center text-xs text-muted-foreground">
                <CheckCircle2 className="mb-2 h-5 w-5 opacity-50" />
                No recent activity
              </div>
            ) : items.slice(0, 12).map((item) => (
              <button
                key={item.id}
                type="button"
                data-workspace-color={item.color}
                onClick={() => openItem(item)}
                disabled={!item.href}
                className="group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="oxsig-workspace-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                  <Clock3 className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{item.label}</span>
                  {item.detail && <span className="block truncate text-[10px] text-muted-foreground">{item.detail}</span>}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(item.at)}</span>
                {item.href && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
