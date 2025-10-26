/**
 * Seed Vault Database
 * Encrypted storage for seed vaults with recovery methods
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { SeedVault } from '../vault/seed-vault';


interface VaultsDB extends DBSchema {
  vaults: {
    key: string;
    value: SeedVault;
    indexes: {
      'by-label': string;
      'by-created': Date;
    };
  };
}

let dbInstance: IDBPDatabase<VaultsDB> | null = null;

/**
 * Initialize vaults database
 */
async function getDB(): Promise<IDBPDatabase<VaultsDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<VaultsDB>('oxsig-vaults', 1, {
    upgrade(db: any) {
      const vaultsStore = db.createObjectStore('vaults', { keyPath: 'id' });
      vaultsStore.createIndex('by-label', 'metadata.label');
      vaultsStore.createIndex('by-created', 'createdAt');
    },
  });

  return dbInstance;
}

/**
 * Save seed vault
 */
export async function saveVault(vault: SeedVault): Promise<void> {
  const db = await getDB();
  await db.put('vaults', vault);
  console.log('Vault saved:', vault.metadata.label);
}

/**
 * Get vault by ID
 */
export async function getVault(vaultId: string): Promise<SeedVault | undefined> {
  const db = await getDB();
  return await db.get('vaults', vaultId);
}

/**
 * Get all vaults
 */
export async function getAllVaults(): Promise<SeedVault[]> {
  const db = await getDB();
  return await db.getAll('vaults');
}

/**
 * Delete vault
 */
export async function deleteVault(vaultId: string): Promise<void> {
  const db = await getDB();
  await db.delete('vaults', vaultId);
  console.log('Vault deleted:', vaultId);
}

/**
 * Update vault last accessed
 */
export async function updateVaultAccess(vaultId: string): Promise<void> {
  const db = await getDB();
  const vault = await db.get('vaults', vaultId);
  
  if (vault) {
    vault.lastAccessed = new Date();
    await db.put('vaults', vault);
  }
}

/**
 * Add recovery method to vault
 */
export async function addRecoveryMethod(
  vaultId: string,
  method: SeedVault['recoveryMethods'][0]
): Promise<void> {
  const db = await getDB();
  const vault = await db.get('vaults', vaultId);
  
  if (vault) {
    vault.recoveryMethods.push(method);
    await db.put('vaults', vault);
    console.log('Recovery method added:', method.type);
  }
}

/**
 * Update recovery method
 */
export async function updateRecoveryMethod(
  vaultId: string,
  methodId: string,
  updates: Partial<SeedVault['recoveryMethods'][0]>
): Promise<void> {
  const db = await getDB();
  const vault = await db.get('vaults', vaultId);
  
  if (vault) {
    const method = vault.recoveryMethods.find(m => m.id === methodId);
    if (method) {
      Object.assign(method, updates);
      await db.put('vaults', vault);
    }
  }
}

/**
 * Get vault statistics
 */
export async function getVaultStats(): Promise<{
  total: number;
  byWordCount: Record<number, number>;
  withBiometric: number;
  withGuardians: number;
  oldestVault?: Date;
  newestVault?: Date;
}> {
  const vaults = await getAllVaults();
  
  const stats = {
    total: vaults.length,
    byWordCount: {} as Record<number, number>,
    withBiometric: 0,
    withGuardians: 0,
    oldestVault: undefined as Date | undefined,
    newestVault: undefined as Date | undefined,
  };
  
  for (const vault of vaults) {
    const wordCount = vault.metadata.wordCount;
    stats.byWordCount[wordCount] = (stats.byWordCount[wordCount] || 0) + 1;
    
    if (vault.metadata.biometricWrapped) stats.withBiometric++;
    if (vault.metadata.guardianBackup) stats.withGuardians++;
    
    if (!stats.oldestVault || vault.createdAt < stats.oldestVault) {
      stats.oldestVault = vault.createdAt;
    }
    if (!stats.newestVault || vault.createdAt > stats.newestVault) {
      stats.newestVault = vault.createdAt;
    }
  }
  
  return stats;
}

/**
 * Clear all vaults (DANGEROUS - for testing only)
 */
export async function clearAllVaults(): Promise<void> {
  const db = await getDB();
  await db.clear('vaults');
  console.warn('All vaults cleared!');
}
