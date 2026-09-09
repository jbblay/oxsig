'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  Info,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth/use-auth';
import type { WorkspaceNotification } from '@/lib/notifications/types';
import {
  clearWorkspaceActivity,
  getWorkspaceActivity,
  subscribeWorkspaceActivity,
  type WorkspaceActivity,
} from '@/lib/persistence/workspace-activity';
import { getCsrfToken } from '@/lib/security/csrf-client';

function relativeTime(value: number) {
  const diff = Math.max(0, Date.now() - value);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function NotificationIcon({ severity }: { severity: WorkspaceNotification['severity'] }) {
  if (severity === 'error') return <CircleAlert className="h-3.5 w-3.5" />;
  if (severity === 'warning') return <AlertTriangle className="h-3.5 w-3.5" />;
  if (severity === 'success') return <CheckCircle2 className="h-3.5 w-3.5" />;
  return <Info className="h-3.5 w-3.5" />;
}

export default function ActivityCenter() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<WorkspaceActivity[]>([]);
  const [notifications, setNotifications] = React.useState<WorkspaceNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = React.useState(false);

  const refresh = React.useCallback(() => setItems(getWorkspaceActivity()), []);
  const refreshNotifications = React.useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      return;
    }
    setNotificationsLoading(true);
    try {
      const response = await fetch('/api/notifications', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json().catch(() => ({}));
      if (Array.isArray(body.notifications)) setNotifications(body.notifications as WorkspaceNotification[]);
    } catch {
      // Activity remains available even when durable notification sync is unavailable.
    } finally {
      setNotificationsLoading(false);
    }
  }, [isAuthenticated]);

  React.useEffect(() => {
    refresh();
    return subscribeWorkspaceActivity(refresh);
  }, [refresh]);

  React.useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      return;
    }
    void refreshNotifications();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshNotifications();
    }, 45_000);
    return () => window.clearInterval(interval);
  }, [isAuthenticated, refreshNotifications]);

  React.useEffect(() => {
    if (open) void refreshNotifications();
  }, [open, refreshNotifications]);

  const markRead = React.useCallback(async (ids?: string[]) => {
    if (!isAuthenticated) return;
    try {
      const csrf = await getCsrfToken();
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify(ids?.length ? { ids } : { all: true }),
      });
      if (!response.ok) return;
      const now = Date.now();
      setNotifications((current) => current.map((item) => (
        !ids?.length || ids.includes(item.id) ? { ...item, readAt: item.readAt || now } : item
      )));
    } catch {
      // Keep unread state unchanged when the server update fails.
    }
  }, [isAuthenticated]);

  const openItem = (item: WorkspaceActivity) => {
    if (!item.href) return;
    setOpen(false);
    router.push(item.href);
  };

  const openNotification = (item: WorkspaceNotification) => {
    if (!item.readAt) void markRead([item.id]);
    if (!item.href) return;
    setOpen(false);
    router.push(item.href);
  };

  const clearActivity = async () => {
    if (isAuthenticated) {
      try {
        const csrf = await getCsrfToken();
        await fetch('/api/workspace-state', {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'x-csrf-token': csrf },
        });
      } catch {
        // Local clear is still useful; durable history can retry on the next explicit clear.
      }
    }
    clearWorkspaceActivity();
    refresh();
  };

  const unreadCount = notifications.filter((item) => !item.readAt).length;

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="relative h-8 w-8"
        onClick={() => setOpen(true)}
        aria-label="Open activity and notifications"
        title="Activity & notifications"
      >
        <Bell className="h-3.5 w-3.5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-cyan-500 px-1 text-[8px] font-bold text-slate-950">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : items.length > 0 ? (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-cyan-500" />
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%_-_1rem)] max-w-lg gap-0 overflow-hidden rounded-xl p-0">
          <DialogHeader className="border-b px-4 py-3 pr-12">
            <DialogTitle className="text-sm">Activity center</DialogTitle>
            <DialogDescription className="mt-1 text-xs">Operational notifications and recent workspace activity.</DialogDescription>
          </DialogHeader>

          <div className="max-h-[520px] overflow-y-auto">
            {isAuthenticated && (
              <section className="border-b p-2" aria-labelledby="notification-center-title">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <p id="notification-center-title" className="mr-auto text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Notifications</p>
                  {unreadCount > 0 && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => void markRead()}>
                      Mark all read
                    </Button>
                  )}
                </div>

                {notificationsLoading && notifications.length === 0 ? (
                  <div className="px-2 py-5 text-center text-xs text-muted-foreground">Loading notifications…</div>
                ) : notifications.length === 0 ? (
                  <div className="flex min-h-20 items-center justify-center text-xs text-muted-foreground">No operational notifications</div>
                ) : notifications.slice(0, 10).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openNotification(item)}
                    className={`group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition hover:bg-muted/60 ${item.readAt ? 'opacity-70' : 'bg-cyan-500/[0.045]'}`}
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${
                      item.severity === 'error' ? 'bg-red-500/10 text-red-500'
                        : item.severity === 'warning' ? 'bg-amber-500/10 text-amber-500'
                          : item.severity === 'success' ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-cyan-500/10 text-cyan-500'
                    }`}>
                      <NotificationIcon severity={item.severity} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{item.title}</span>
                      {item.detail && <span className="block truncate text-[10px] text-muted-foreground">{item.detail}</span>}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(item.at)}</span>
                    {item.href && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />}
                  </button>
                ))}
              </section>
            )}

            <section className="p-2" aria-labelledby="recent-activity-title">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <p id="recent-activity-title" className="mr-auto text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recent activity</p>
                {items.length > 0 && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => void clearActivity()}>
                    <Trash2 className="h-3 w-3" /> Clear
                  </Button>
                )}
              </div>

              {items.length === 0 ? (
                <div className="flex min-h-24 flex-col items-center justify-center text-center text-xs text-muted-foreground">
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
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
