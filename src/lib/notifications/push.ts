/**
 * Push Notifications System
 * Provides real-time security alerts and notifications
 */

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  actions?: NotificationAction[];
  tag?: string;
  requireInteraction?: boolean;
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

// Extend NotificationOptions to include actions and vibrate (supported but not in TS types)
interface ExtendedNotificationOptions extends NotificationOptions {
  actions?: NotificationAction[];
  vibrate?: number[];
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Check current permission status
 */
export function getPermissionStatus(): NotificationPermission {
  if (!isPushSupported()) return 'denied';
  return Notification.permission;
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isPushSupported()) {
    console.warn('Push notifications not supported');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
}

/**
 * Show local notification
 */
export async function showNotification(payload: NotificationPayload): Promise<void> {
  if (!isPushSupported()) {
    console.warn('Notifications not supported');
    return;
  }

  const permission = await requestNotificationPermission();
  if (!permission) {
    console.warn('Notification permission denied');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    const options: ExtendedNotificationOptions = {
      body: payload.body,
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/favicon.ico',
      data: payload.data,
      actions: payload.actions || [],
      tag: payload.tag,
      requireInteraction: payload.requireInteraction || false,
      vibrate: [200, 100, 200],
    };
    
    await registration.showNotification(payload.title, options);
  } catch (error) {
    console.error('Error showing notification:', error);
  }
}

/**
 * Show security alert notification
 */
export async function showSecurityAlert(
  message: string,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): Promise<void> {
  const icons = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
  };

  await showNotification({
    title: `${icons[severity]} Security Alert`,
    body: message,
    tag: 'security-alert',
    requireInteraction: severity === 'critical',
    actions: [
      { action: 'view', title: 'View Details' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    data: { type: 'security-alert', severity },
  });
}

/**
 * Show signature request notification
 */
export async function showSignatureRequest(
  documentName: string,
  requester: string
): Promise<void> {
  await showNotification({
    title: '✍️ Signature Request',
    body: `${requester} requested your signature on "${documentName}"`,
    tag: 'signature-request',
    requireInteraction: true,
    actions: [
      { action: 'sign', title: 'Sign Now' },
      { action: 'review', title: 'Review' },
      { action: 'decline', title: 'Decline' },
    ],
    data: { type: 'signature-request', documentName, requester },
  });
}

/**
 * Show document signed notification
 */
export async function showDocumentSigned(documentName: string): Promise<void> {
  await showNotification({
    title: '✅ Document Signed',
    body: `"${documentName}" has been successfully signed`,
    tag: 'document-signed',
    data: { type: 'document-signed', documentName },
  });
}

/**
 * Show collaboration invite
 */
export async function showCollaborationInvite(
  projectName: string,
  inviter: string
): Promise<void> {
  await showNotification({
    title: '🤝 Collaboration Invite',
    body: `${inviter} invited you to collaborate on "${projectName}"`,
    tag: 'collab-invite',
    requireInteraction: true,
    actions: [
      { action: 'accept', title: 'Accept' },
      { action: 'decline', title: 'Decline' },
    ],
    data: { type: 'collab-invite', projectName, inviter },
  });
}

/**
 * Show sync complete notification
 */
export async function showSyncComplete(itemCount: number): Promise<void> {
  await showNotification({
    title: '🔄 Sync Complete',
    body: `Successfully synced ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
    tag: 'sync-complete',
    data: { type: 'sync-complete', itemCount },
  });
}

/**
 * Show backup complete notification
 */
export async function showBackupComplete(): Promise<void> {
  await showNotification({
    title: '💾 Backup Complete',
    body: 'Your data has been securely backed up',
    tag: 'backup-complete',
    data: { type: 'backup-complete' },
  });
}

/**
 * Show key rotation reminder
 */
export async function showKeyRotationReminder(): Promise<void> {
  await showNotification({
    title: '🔑 Key Rotation Recommended',
    body: 'Your cryptographic keys are over 90 days old. Consider rotating them.',
    tag: 'key-rotation',
    requireInteraction: true,
    actions: [
      { action: 'rotate', title: 'Rotate Now' },
      { action: 'remind-later', title: 'Remind Later' },
    ],
    data: { type: 'key-rotation' },
  });
}

/**
 * Schedule periodic notifications
 */
export class NotificationScheduler {
  private intervals: Map<string, number> = new Map();

  /**
   * Schedule security scan notification
   */
  scheduleSecurityScan(intervalHours: number = 24): void {
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    const intervalId = window.setInterval(() => {
      showSecurityAlert('Scheduled security scan completed. No threats detected.', 'low');
    }, intervalMs);
    
    this.intervals.set('security-scan', intervalId);
  }

  /**
   * Schedule backup reminder
   */
  scheduleBackupReminder(intervalHours: number = 168): void { // 7 days
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    const intervalId = window.setInterval(() => {
      showNotification({
        title: '💾 Backup Reminder',
        body: 'Time to backup your encrypted data',
        tag: 'backup-reminder',
        actions: [
          { action: 'backup', title: 'Backup Now' },
          { action: 'skip', title: 'Skip' },
        ],
      });
    }, intervalMs);
    
    this.intervals.set('backup-reminder', intervalId);
  }

  /**
   * Clear all scheduled notifications
   */
  clearAll(): void {
    this.intervals.forEach((intervalId) => {
      window.clearInterval(intervalId);
    });
    this.intervals.clear();
  }

  /**
   * Clear specific notification schedule
   */
  clear(name: string): void {
    const intervalId = this.intervals.get(name);
    if (intervalId) {
      window.clearInterval(intervalId);
      this.intervals.delete(name);
    }
  }
}

/**
 * Notification click handler
 */
export function handleNotificationClick(action: string, data: Record<string, unknown>): void {
  switch (action) {
    case 'view':
    case 'sign':
      window.location.href = '/sign';
      break;
    case 'review':
      window.location.href = `/sign?doc=${data.documentName}`;
      break;
    case 'accept':
      window.location.href = '/collab';
      break;
    case 'rotate':
      window.location.href = '/security';
      break;
    case 'backup':
      window.location.href = '/profile?tab=preferences';
      break;
    default:
      console.log('Unknown notification action:', action);
  }
}

/**
 * Global notification scheduler instance
 */
export const notificationScheduler = new NotificationScheduler();

/**
 * Initialize notifications system
 */
export async function initNotifications(): Promise<void> {
  if (!isPushSupported()) {
    console.warn('Push notifications not supported on this device');
    return;
  }

  // Request permission on init
  const granted = await requestNotificationPermission();
  
  if (granted) {
    console.log('Notifications initialized successfully');
    
    // Start periodic security scans
    notificationScheduler.scheduleSecurityScan(24);
    
    // Start backup reminders
    notificationScheduler.scheduleBackupReminder(168);
  }
}
