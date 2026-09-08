export type WorkspaceNotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export type WorkspaceNotification = {
  id: string;
  type: string;
  title: string;
  detail?: string;
  href?: string;
  severity: WorkspaceNotificationSeverity;
  readAt?: number;
  at: number;
};
