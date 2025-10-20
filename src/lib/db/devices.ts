/**
 * Device Management Database
 * Stores paired devices for push notifications and authentication
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { PairedDevice } from '../pairing/qr-pairing';

interface DevicesDB extends DBSchema {
  // @ts-expect-error - idb type issue with DBSchema indexes
  devices: {
    key: string;
    value: PairedDevice;
    indexes: {
      'by-user': string;
      'by-pubkey': string;
      'by-trusted': boolean;
    };
  };
}

let dbInstance: IDBPDatabase<DevicesDB> | null = null;

/**
 * Initialize devices database
 */
async function getDB(): Promise<IDBPDatabase<DevicesDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<DevicesDB>('oxsig-devices', 1, {
    upgrade(db: any) {
      // Create devices store
      const devicesStore = db.createObjectStore('devices', { keyPath: 'id' });
      devicesStore.createIndex('by-user', 'userDid');
      devicesStore.createIndex('by-pubkey', 'devicePubKey');
      devicesStore.createIndex('by-trusted', 'trusted');
    },
  });

  return dbInstance;
}

/**
 * Save a paired device
 */
export async function savePairedDevice(device: PairedDevice): Promise<void> {
  const db = await getDB();
  await db.put('devices', device);
}

/**
 * Get device by ID
 */
export async function getDevice(deviceId: string): Promise<PairedDevice | undefined> {
  const db = await getDB();
  return await db.get('devices', deviceId);
}

/**
 * Get all devices for a user
 */
export async function getUserDevices(userDid: string): Promise<PairedDevice[]> {
  const db = await getDB();
  const index = db.transaction('devices').store.index('by-user');
  return await index.getAll(userDid);
}

/**
 * Get all trusted devices
 */
export async function getTrustedDevices(userDid?: string): Promise<PairedDevice[]> {
  const db = await getDB();
  const index = db.transaction('devices').store.index('by-trusted');
  const allTrusted = await index.getAll(true);
  
  if (userDid) {
    return allTrusted.filter((d: PairedDevice) => d.userDid === userDid);
  }
  
  return allTrusted;
}

/**
 * Update device last seen timestamp
 */
export async function updateDeviceLastSeen(deviceId: string): Promise<void> {
  const db = await getDB();
  const device = await db.get('devices', deviceId);
  
  if (device) {
    device.lastSeen = new Date();
    await db.put('devices', device);
  }
}

/**
 * Trust/untrust a device
 */
export async function setDeviceTrust(deviceId: string, trusted: boolean): Promise<void> {
  const db = await getDB();
  const device = await db.get('devices', deviceId);
  
  if (device) {
    device.trusted = trusted;
    await db.put('devices', device);
  }
}

/**
 * Remove a device
 */
export async function removeDevice(deviceId: string): Promise<void> {
  const db = await getDB();
  await db.delete('devices', deviceId);
}

/**
 * Remove all devices for a user
 */
export async function removeUserDevices(userDid: string): Promise<void> {
  const devices = await getUserDevices(userDid);
  const db = await getDB();
  
  for (const device of devices) {
    await db.delete('devices', device.id);
  }
}

/**
 * Get device by public key
 */
export async function getDeviceByPubKey(pubKey: string): Promise<PairedDevice | undefined> {
  const db = await getDB();
  const index = db.transaction('devices').store.index('by-pubkey');
  return await index.get(pubKey);
}

/**
 * Update device push endpoint
 */
export async function updateDevicePushEndpoint(
  deviceId: string,
  pushEndpoint: string
): Promise<void> {
  const db = await getDB();
  const device = await db.get('devices', deviceId);
  
  if (device) {
    device.pushEndpoint = pushEndpoint;
    await db.put('devices', device);
  }
}

/**
 * Get all devices (for admin/debugging)
 */
export async function getAllDevices(): Promise<PairedDevice[]> {
  const db = await getDB();
  return await db.getAll('devices');
}

/**
 * Clear all devices (for testing)
 */
export async function clearAllDevices(): Promise<void> {
  const db = await getDB();
  await db.clear('devices');
}
