/**
 * Tauri Detection and Integration Utilities
 * Provides helpers for detecting Tauri environment and accessing native features
 */

/**
 * Check if the app is running in Tauri (desktop) environment
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI__' in window;
}

/**
 * Lazy-load Tauri API only when running in Tauri environment
 */
export async function getTauriAPI() {
  if (!isTauri()) {
    throw new Error('Not running in Tauri environment');
  }
  
  const { invoke } = await import('@tauri-apps/api/core');
  const { save, open } = await import('@tauri-apps/plugin-dialog');
  const { sendNotification, isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
  const { writeTextFile, readTextFile, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
  
  return {
    invoke,
    dialog: { save, open },
    notification: { sendNotification, isPermissionGranted, requestPermission },
    fs: { writeTextFile, readTextFile, exists, BaseDirectory },
  };
}

/**
 * Platform detection
 */
export async function getPlatform() {
  if (!isTauri()) return 'web';
  
  const { platform } = await import('@tauri-apps/plugin-os');
  return platform();
}

/**
 * Show native file save dialog
 */
export async function showSaveDialog(options?: {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}) {
  if (!isTauri()) {
    throw new Error('Native dialogs only available in desktop app');
  }
  
  const { save } = await import('@tauri-apps/plugin-dialog');
  return save(options);
}

/**
 * Show native file open dialog
 */
export async function showOpenDialog(options?: {
  multiple?: boolean;
  directory?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
}) {
  if (!isTauri()) {
    throw new Error('Native dialogs only available in desktop app');
  }
  
  const { open } = await import('@tauri-apps/plugin-dialog');
  return open(options);
}

/**
 * Send native notification
 */
export async function sendDesktopNotification(title: string, body: string) {
  if (!isTauri()) {
    // Fallback to web notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
    return;
  }
  
  const { sendNotification, isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
  
  let permission = await isPermissionGranted();
  if (!permission) {
    permission = (await requestPermission()) === 'granted';
  }
  
  if (permission) {
    sendNotification({ title, body });
  }
}

/**
 * Write file to native filesystem
 */
export async function writeFile(path: string, contents: string) {
  if (!isTauri()) {
    throw new Error('Native filesystem only available in desktop app');
  }
  
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  return writeTextFile(path, contents);
}

/**
 * Read file from native filesystem
 */
export async function readFile(path: string) {
  if (!isTauri()) {
    throw new Error('Native filesystem only available in desktop app');
  }
  
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  return readTextFile(path);
}
