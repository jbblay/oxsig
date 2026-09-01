/**
 * Push Notification Integration for Device Pairing
 * Enables document signature prompts on paired devices
 */

import { requestNotificationPermission } from '@/lib/notifications/push';
import { updateDevicePushEndpoint } from '@/lib/db/devices';
import type { PairedDevice } from '@/lib/pairing/qr-pairing';

export interface SignatureRequest {
  id: string;
  documentName: string;
  documentHash: string;
  requesterDid: string;
  requesterName?: string;
  timestamp: string;
  expiresAt: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface NotificationPayload {
  type: 'signature_request' | 'document_shared' | 'security_alert' | 'vault_access';
  title: string;
  body: string;
  data: Record<string, any>;
  actions?: Array<{ action: string; title: string }>;
  badge?: string;
  icon?: string;
  vibrate?: number[];
}

/**
 * Subscribe to push notifications
 */
async function subscribeToPush(): Promise<PushSubscription | null> {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    
    // For demo, subscribe without VAPID (production should use proper VAPID keys)
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
    });

    return subscription;
  } catch (error) {
    console.error('Push subscription failed:', error);
    return null;
  }
}

/**
 * Initialize push notifications for a device
 */
export async function initializePushForDevice(deviceId: string): Promise<boolean> {
  try {
    // Request permission
    const granted = await requestNotificationPermission();
    if (!granted) {
      console.warn('Notification permission denied');
      return false;
    }

    // Subscribe to push service
    const subscription = await subscribeToPush();
    if (!subscription) {
      console.warn('Push subscription failed');
      return false;
    }

    // Update device with push endpoint
    await updateDevicePushEndpoint(deviceId, subscription.endpoint);
    
    console.log('✓ Push notifications initialized for device:', deviceId);
    return true;
  } catch (error) {
    console.error('Failed to initialize push:', error);
    return false;
  }
}

/**
 * Send signature request notification to device
 */
export async function sendSignatureRequest(
  device: PairedDevice,
  request: SignatureRequest
): Promise<void> {
  if (!device.pushEndpoint) {
    throw new Error('Device has no push endpoint');
  }

  const payload: NotificationPayload = {
    type: 'signature_request',
    title: '✍️ Signature Request',
    body: `${request.requesterName || 'Someone'} requests your signature on "${request.documentName}"`,
    data: {
      requestId: request.id,
      documentHash: request.documentHash,
      documentName: request.documentName,
      requesterDid: request.requesterDid,
      timestamp: request.timestamp,
      expiresAt: request.expiresAt,
    },
    actions: [
      { action: 'approve', title: '✓ Approve' },
      { action: 'preview', title: '👁️ Preview' },
      { action: 'reject', title: '✕ Reject' },
    ],
    badge: '/icons/badge-signature.png',
    icon: '/icons/icon-512x512.png',
    vibrate: [200, 100, 200],
  };

  await sendPushNotification(device.pushEndpoint, payload);
}

/**
 * Send security alert notification
 */
export async function sendSecurityAlert(
  device: PairedDevice,
  alert: {
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    message: string;
    actionUrl?: string;
  }
): Promise<void> {
  if (!device.pushEndpoint) return;

  const severityEmoji = {
    low: 'ℹ️',
    medium: '⚠️',
    high: '🚨',
    critical: '🔴',
  };

  const payload: NotificationPayload = {
    type: 'security_alert',
    title: `${severityEmoji[alert.severity]} Security Alert`,
    body: alert.message,
    data: {
      severity: alert.severity,
      timestamp: new Date().toISOString(),
      actionUrl: alert.actionUrl,
    },
    actions: alert.actionUrl ? [
      { action: 'view', title: 'View Details' },
      { action: 'dismiss', title: 'Dismiss' },
    ] : undefined,
    vibrate: alert.severity === 'critical' ? [300, 200, 300, 200, 300] : [200, 100, 200],
  };

  await sendPushNotification(device.pushEndpoint, payload);
}

/**
 * Send vault access notification
 */
export async function sendVaultAccessNotification(
  device: PairedDevice,
  vaultLabel: string,
  action: 'unlocked' | 'created' | 'exported'
): Promise<void> {
  if (!device.pushEndpoint) return;

  const actionText = {
    unlocked: 'was unlocked',
    created: 'was created',
    exported: 'was exported',
  };

  const payload: NotificationPayload = {
    type: 'vault_access',
    title: '🔐 Vault Activity',
    body: `Vault "${vaultLabel}" ${actionText[action]}`,
    data: {
      vaultLabel,
      action,
      timestamp: new Date().toISOString(),
      deviceId: device.id,
    },
    vibrate: [100],
  };

  await sendPushNotification(device.pushEndpoint, payload);
}

/**
 * Send document shared notification
 */
export async function sendDocumentSharedNotification(
  device: PairedDevice,
  documentName: string,
  sharedBy: string
): Promise<void> {
  if (!device.pushEndpoint) return;

  const payload: NotificationPayload = {
    type: 'document_shared',
    title: '📄 Document Shared',
    body: `${sharedBy} shared "${documentName}" with you`,
    data: {
      documentName,
      sharedBy,
      timestamp: new Date().toISOString(),
    },
    actions: [
      { action: 'view', title: 'View' },
      { action: 'later', title: 'Later' },
    ],
    vibrate: [100],
  };

  await sendPushNotification(device.pushEndpoint, payload);
}

/**
 * Send push notification to endpoint
 */
async function sendPushNotification(
  endpoint: string,
  payload: NotificationPayload
): Promise<void> {
  try {
    // In production, this would send to your push server
    // For now, we'll use the browser's notification API directly
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        const notification = new Notification(payload.title, {
          body: payload.body,
          icon: payload.icon || '/icons/icon-192x192.png',
          badge: payload.badge,
          data: payload.data,
          // @ts-expect-error - TypeScript doesn't know about actions/vibrate
          actions: payload.actions,
          vibrate: payload.vibrate,
          tag: payload.data.requestId || payload.type,
          requireInteraction: payload.type === 'signature_request',
        });

        // Handle notification clicks
        notification.onclick = () => {
          window.focus();
          if (payload.data.actionUrl) {
            window.location.href = payload.data.actionUrl;
          }
          notification.close();
        };
      }
    }

    console.log('✓ Push notification sent:', payload.type);
  } catch (error) {
    console.error('Failed to send push notification:', error);
    throw error;
  }
}

/**
 * Handle notification action (approve/reject signature)
 */
export async function handleNotificationAction(
  action: 'approve' | 'reject' | 'preview',
  requestId: string,
  documentHash: string
): Promise<void> {
  console.log(`Handling ${action} for request ${requestId}`);

  switch (action) {
    case 'approve':
      // TODO: Navigate to sign page with pre-filled data
      if (typeof window !== 'undefined') {
        window.location.href = `/sharedocs?requestId=${requestId}&hash=${documentHash}&action=approve`;
      }
      break;

    case 'reject':
      // TODO: Send rejection response
      if (typeof window !== 'undefined') {
        window.location.href = `/sharedocs?requestId=${requestId}&hash=${documentHash}&action=reject`;
      }
      break;

    case 'preview':
      // TODO: Open document preview
      if (typeof window !== 'undefined') {
        window.location.href = `/sharedocs?requestId=${requestId}&hash=${documentHash}&action=preview`;
      }
      break;
  }
}

/**
 * Register service worker for push notifications
 */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('✓ Service Worker registered for push');
    
    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'notification-action') {
        const { action, requestId, documentHash } = event.data;
        handleNotificationAction(action, requestId, documentHash);
      }
    });

    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}
