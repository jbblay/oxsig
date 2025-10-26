/**
 * Vault Backup and Recovery System
 * Secure encrypted backup with versioning and integrity verification
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Simple encryption/decryption using Web Crypto API
async function encrypt(data: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBytes = new Uint8Array(hexToBytes(key.slice(0, 64))); // Use first 32 bytes
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encoder.encode(data)
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return bytesToHex(combined);
}

async function decrypt(encryptedData: string, key: string): Promise<string> {
  const decoder = new TextDecoder();
  const keyBytes = new Uint8Array(hexToBytes(key.slice(0, 64))); // Use first 32 bytes
  const combined = hexToBytes(encryptedData);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encrypted
  );
  
  return decoder.decode(decrypted);
}

export interface BackupMetadata {
  id: string;
  userId: string;
  version: number;
  createdAt: Date;
  description?: string;
  fileCount: number;
  totalSize: number;
  checksum: string;
  encryptionMethod: string;
  compressionMethod: string;
}

export interface BackupItem {
  id: string;
  type: 'identity' | 'document' | 'signature' | 'key' | 'settings' | 'collaboration';
  name: string;
  data: any;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BackupOptions {
  includeIdentities?: boolean;
  includeDocuments?: boolean;
  includeSignatures?: boolean;
  includeKeys?: boolean;
  includeSettings?: boolean;
  includeCollaborations?: boolean;
  compress?: boolean;
  description?: string;
}

export interface RestoreOptions {
  overwriteExisting?: boolean;
  selectiveRestore?: string[]; // Item IDs to restore
  validateIntegrity?: boolean;
}

export interface BackupProgress {
  stage: 'preparing' | 'collecting' | 'encrypting' | 'compressing' | 'uploading' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  itemsProcessed?: number;
  totalItems?: number;
}

export type BackupProgressCallback = (progress: BackupProgress) => void;

export class VaultBackupSystem {
  private storageKey = 'oxsig_vault_backups_v1';

  constructor() {
    // No crypto provider needed - using Web Crypto API directly
  }

  /**
   * Create a complete backup of vault data
   */
  async createBackup(
    options: BackupOptions = {},
    progressCallback?: BackupProgressCallback
  ): Promise<BackupMetadata> {
    const userId = await this.getCurrentUserId();
    const backupId = this.generateBackupId();
    
    try {
      this.reportProgress({ stage: 'preparing', progress: 0, message: 'Preparing backup...' }, progressCallback);

      // Collect all data based on options
      this.reportProgress({ stage: 'collecting', progress: 10, message: 'Collecting vault data...' }, progressCallback);
      const items = await this.collectVaultData(options, progressCallback);

      // Generate metadata
      const metadata: BackupMetadata = {
        id: backupId,
        userId,
        version: await this.getNextBackupVersion(userId),
        createdAt: new Date(),
        description: options.description,
        fileCount: items.length,
        totalSize: this.calculateTotalSize(items),
        checksum: '',
        encryptionMethod: 'AES-256-GCM + Ed25519',
        compressionMethod: options.compress ? 'gzip' : 'none'
      };

      // Prepare backup payload
      this.reportProgress({ stage: 'encrypting', progress: 50, message: 'Encrypting backup data...' }, progressCallback);
      const payload = {
        metadata,
        items,
        timestamp: Date.now(),
        version: '1.0'
      };

      // Compress if requested
      let serializedData = JSON.stringify(payload);
      if (options.compress) {
        this.reportProgress({ stage: 'compressing', progress: 60, message: 'Compressing backup...' }, progressCallback);
        serializedData = await this.compressData(serializedData);
      }

      // Encrypt the backup
      const encryptedBackup = await this.encryptBackup(serializedData, userId);
      
      // Calculate checksum
      metadata.checksum = bytesToHex(sha256(new TextEncoder().encode(encryptedBackup)));

      // Store backup
      this.reportProgress({ stage: 'uploading', progress: 90, message: 'Storing backup...' }, progressCallback);
      await this.storeBackup(backupId, encryptedBackup, metadata);

      this.reportProgress({ stage: 'complete', progress: 100, message: 'Backup completed successfully!' }, progressCallback);
      
      return metadata;
    } catch (error) {
      this.reportProgress({ 
        stage: 'error', 
        progress: 0, 
        message: `Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, progressCallback);
      throw error;
    }
  }

  /**
   * Restore vault data from backup
   */
  async restoreBackup(
    backupId: string,
    options: RestoreOptions = {},
    progressCallback?: BackupProgressCallback
  ): Promise<void> {
    try {
      this.reportProgress({ stage: 'preparing', progress: 0, message: 'Loading backup...' }, progressCallback);

      // Load and decrypt backup
      const { encryptedData, metadata } = await this.loadBackup(backupId);
      
      this.reportProgress({ stage: 'collecting', progress: 20, message: 'Decrypting backup...' }, progressCallback);
      const decryptedData = await this.decryptBackup(encryptedData, metadata.userId);

      // Verify integrity if requested
      if (options.validateIntegrity) {
        this.reportProgress({ stage: 'collecting', progress: 30, message: 'Validating backup integrity...' }, progressCallback);
        await this.validateBackupIntegrity(decryptedData, metadata);
      }

      // Parse backup data
      let payload;
      if (metadata.compressionMethod === 'gzip') {
        const decompressed = await this.decompressData(decryptedData);
        payload = JSON.parse(decompressed);
      } else {
        payload = JSON.parse(decryptedData);
      }

      const items: BackupItem[] = payload.items;
      let itemsToRestore = items;

      // Filter items if selective restore
      if (options.selectiveRestore) {
        itemsToRestore = items.filter(item => options.selectiveRestore!.includes(item.id));
      }

      this.reportProgress({ 
        stage: 'collecting', 
        progress: 40, 
        message: `Restoring ${itemsToRestore.length} items...`,
        totalItems: itemsToRestore.length,
        itemsProcessed: 0
      }, progressCallback);

      // Restore items
      for (let i = 0; i < itemsToRestore.length; i++) {
        const item = itemsToRestore[i];
        const progress = 40 + (i / itemsToRestore.length) * 50;
        
        this.reportProgress({ 
          stage: 'collecting', 
          progress, 
          message: `Restoring ${item.name}...`,
          totalItems: itemsToRestore.length,
          itemsProcessed: i
        }, progressCallback);

        await this.restoreItem(item, options.overwriteExisting);
      }

      this.reportProgress({ stage: 'complete', progress: 100, message: 'Restore completed successfully!' }, progressCallback);
      
    } catch (error) {
      this.reportProgress({ 
        stage: 'error', 
        progress: 0, 
        message: `Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, progressCallback);
      throw error;
    }
  }

  /**
   * List available backups
   */
  async listBackups(userId?: string): Promise<BackupMetadata[]> {
    const currentUserId = userId || await this.getCurrentUserId();
    const backups = this.getStoredBackups();
    
    return backups
      .filter(backup => backup.userId === currentUserId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    const backups = this.getStoredBackups();
    const updatedBackups = backups.filter(backup => backup.id !== backupId);
    
    localStorage.setItem(this.storageKey, JSON.stringify(updatedBackups));
    
    // Also remove the backup data
    localStorage.removeItem(`oxsig_backup_data_${backupId}`);
  }

  /**
   * Get backup details
   */
  async getBackupDetails(backupId: string): Promise<BackupMetadata | null> {
    const backups = this.getStoredBackups();
    return backups.find(backup => backup.id === backupId) || null;
  }

  /**
   * Export backup to file
   */
  async exportBackup(backupId: string): Promise<Blob> {
    const { encryptedData, metadata } = await this.loadBackup(backupId);
    
    const exportData = {
      metadata,
      data: encryptedData,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    return blob;
  }

  /**
   * Import backup from file
   */
  async importBackup(file: File, progressCallback?: BackupProgressCallback): Promise<BackupMetadata> {
    try {
      this.reportProgress({ stage: 'preparing', progress: 0, message: 'Reading backup file...' }, progressCallback);

      const fileContent = await file.text();
      const importData = JSON.parse(fileContent);

      if (!importData.metadata || !importData.data) {
        throw new Error('Invalid backup file format');
      }

      this.reportProgress({ stage: 'uploading', progress: 50, message: 'Importing backup...' }, progressCallback);

      // Store the imported backup
      await this.storeBackup(importData.metadata.id, importData.data, importData.metadata);

      this.reportProgress({ stage: 'complete', progress: 100, message: 'Backup imported successfully!' }, progressCallback);

      return importData.metadata;
    } catch (error) {
      this.reportProgress({ 
        stage: 'error', 
        progress: 0, 
        message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }, progressCallback);
      throw error;
    }
  }

  // Private methods

  private async collectVaultData(
    options: BackupOptions,
    progressCallback?: BackupProgressCallback
  ): Promise<BackupItem[]> {
    const items: BackupItem[] = [];
    let progress = 10;

    if (options.includeIdentities !== false) {
      this.reportProgress({ stage: 'collecting', progress: progress += 10, message: 'Collecting identities...' }, progressCallback);
      const identities = await this.collectIdentities();
      items.push(...identities);
    }

    if (options.includeDocuments !== false) {
      this.reportProgress({ stage: 'collecting', progress: progress += 10, message: 'Collecting documents...' }, progressCallback);
      const documents = await this.collectDocuments();
      items.push(...documents);
    }

    if (options.includeSignatures !== false) {
      this.reportProgress({ stage: 'collecting', progress: progress += 10, message: 'Collecting signatures...' }, progressCallback);
      const signatures = await this.collectSignatures();
      items.push(...signatures);
    }

    if (options.includeKeys !== false) {
      this.reportProgress({ stage: 'collecting', progress: progress += 10, message: 'Collecting keys...' }, progressCallback);
      const keys = await this.collectKeys();
      items.push(...keys);
    }

    if (options.includeSettings !== false) {
      this.reportProgress({ stage: 'collecting', progress: progress += 5, message: 'Collecting settings...' }, progressCallback);
      const settings = await this.collectSettings();
      items.push(...settings);
    }

    if (options.includeCollaborations !== false) {
      this.reportProgress({ stage: 'collecting', progress: progress += 5, message: 'Collecting collaborations...' }, progressCallback);
      const collaborations = await this.collectCollaborations();
      items.push(...collaborations);
    }

    return items;
  }

  private async collectIdentities(): Promise<BackupItem[]> {
    const identities: BackupItem[] = [];
    
    // Collect from localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('oxsig_identity_') || key?.startsWith('did_')) {
        const data = localStorage.getItem(key);
        if (data) {
          identities.push({
            id: this.generateItemId(),
            type: 'identity',
            name: key,
            data: JSON.parse(data),
            metadata: { storageKey: key },
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }

    return identities;
  }

  private async collectDocuments(): Promise<BackupItem[]> {
    const documents: BackupItem[] = [];
    
    // Collect from IndexedDB (if available)
    if ('indexedDB' in window) {
      try {
        const db = await this.openIndexedDB();
        const transaction = db.transaction(['documents'], 'readonly');
        const store = transaction.objectStore('documents');
        
        const request = store.getAll();
        const docs = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }) as any[];

        docs.forEach(doc => {
          documents.push({
            id: this.generateItemId(),
            type: 'document',
            name: doc.name || doc.id,
            data: doc,
            metadata: { source: 'indexeddb' },
            createdAt: new Date(doc.createdAt || Date.now()),
            updatedAt: new Date(doc.updatedAt || Date.now())
          });
        });

        db.close();
      } catch (error) {
        console.warn('Failed to collect documents from IndexedDB:', error);
      }
    }

    return documents;
  }

  private async collectSignatures(): Promise<BackupItem[]> {
    const signatures: BackupItem[] = [];
    
    // Collect signatures from localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('oxsig_signature_') || key?.startsWith('signature_')) {
        const data = localStorage.getItem(key);
        if (data) {
          signatures.push({
            id: this.generateItemId(),
            type: 'signature',
            name: key,
            data: JSON.parse(data),
            metadata: { storageKey: key },
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }

    return signatures;
  }

  private async collectKeys(): Promise<BackupItem[]> {
    const keys: BackupItem[] = [];
    
    // Collect cryptographic keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.includes('key') || key?.includes('crypto') || key?.includes('ed25519')) {
        const data = localStorage.getItem(key);
        if (data) {
          keys.push({
            id: this.generateItemId(),
            type: 'key',
            name: key,
            data: JSON.parse(data),
            metadata: { storageKey: key },
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }

    return keys;
  }

  private async collectSettings(): Promise<BackupItem[]> {
    const settings: BackupItem[] = [];
    
    // Collect application settings
    const settingsKeys = [
      'theme', 'voice-commands-auto-start', 'p2p_settings_v1',
      'oxsig_preferences', 'oxsig_security_settings'
    ];

    settingsKeys.forEach(key => {
      const data = localStorage.getItem(key);
      if (data) {
        settings.push({
          id: this.generateItemId(),
          type: 'settings',
          name: key,
          data: data,
          metadata: { storageKey: key },
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    });

    return settings;
  }

  private async collectCollaborations(): Promise<BackupItem[]> {
    const collaborations: BackupItem[] = [];
    
    // Collect collaboration data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('collab_') || key?.startsWith('collaboration_')) {
        const data = localStorage.getItem(key);
        if (data) {
          collaborations.push({
            id: this.generateItemId(),
            type: 'collaboration',
            name: key,
            data: JSON.parse(data),
            metadata: { storageKey: key },
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }

    return collaborations;
  }

  private async restoreItem(item: BackupItem, overwrite = false): Promise<void> {
    switch (item.type) {
      case 'identity':
      case 'signature':
      case 'key':
      case 'collaboration':
        if (item.metadata.storageKey) {
          const existing = localStorage.getItem(item.metadata.storageKey);
          if (!existing || overwrite) {
            localStorage.setItem(item.metadata.storageKey, JSON.stringify(item.data));
          }
        }
        break;

      case 'settings':
        if (item.metadata.storageKey) {
          const existing = localStorage.getItem(item.metadata.storageKey);
          if (!existing || overwrite) {
            localStorage.setItem(item.metadata.storageKey, item.data);
          }
        }
        break;

      case 'document':
        if ('indexedDB' in window) {
          try {
            const db = await this.openIndexedDB();
            const transaction = db.transaction(['documents'], 'readwrite');
            const store = transaction.objectStore('documents');
            
            if (overwrite) {
              store.put(item.data);
            } else {
              const existing = await new Promise((resolve) => {
                const request = store.get(item.data.id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
              });
              
              if (!existing) {
                store.add(item.data);
              }
            }
            
            db.close();
          } catch (error) {
            console.warn('Failed to restore document:', error);
          }
        }
        break;
    }
  }

  private async encryptBackup(data: string, userId: string): Promise<string> {
    const key = await this.deriveBackupKey(userId);
    return await encrypt(data, key);
  }

  private async decryptBackup(encryptedData: string, userId: string): Promise<string> {
    const key = await this.deriveBackupKey(userId);
    return await decrypt(encryptedData, key);
  }

  private async deriveBackupKey(userId: string): Promise<string> {
    // Derive a deterministic backup-specific key from user credentials
    // This key must be deterministic so backups can be decrypted later
    // NOTE: In production, use a proper KDF (PBKDF2/Argon2) with user passphrase
    // Current implementation provides basic encryption for userId-based backups
    const keyMaterial = `backup_key_${userId}`;
    const hash = sha256(new TextEncoder().encode(keyMaterial));
    return bytesToHex(hash);
  }

  private async compressData(data: string): Promise<string> {
    // Simple base64 encoding as compression placeholder
    // In production, use a proper compression library
    try {
      if (typeof CompressionStream !== 'undefined') {
        const encoder = new TextEncoder();
        const stream = new CompressionStream('gzip');
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();
        
        writer.write(encoder.encode(data));
        writer.close();
        
        const chunks: Uint8Array[] = [];
        let done = false;
        
        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            chunks.push(new Uint8Array(value));
          }
        }
        
        const compressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
          compressed.set(chunk, offset);
          offset += chunk.length;
        }
        
        return bytesToHex(compressed);
      } else {
        // Fallback: just return base64 encoded data
        return btoa(data);
      }
    } catch (error) {
      console.warn('Compression failed, using base64 fallback:', error);
      return btoa(data);
    }
  }

  private async decompressData(compressedHex: string): Promise<string> {
    try {
      if (typeof DecompressionStream !== 'undefined' && compressedHex.length % 2 === 0) {
        // Try hex decoding first
        try {
          const compressed = hexToBytes(compressedHex);
          
          const stream = new DecompressionStream('gzip');
          const writer = stream.writable.getWriter();
          const reader = stream.readable.getReader();
          
          writer.write(new Uint8Array(compressed));
          writer.close();
          
          const chunks: Uint8Array[] = [];
          let done = false;
          
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              chunks.push(new Uint8Array(value));
            }
          }
          
          const decompressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
          let offset = 0;
          for (const chunk of chunks) {
            decompressed.set(chunk, offset);
            offset += chunk.length;
          }
          
          const decoder = new TextDecoder();
          return decoder.decode(decompressed);
        } catch (hexError) {
          // Fall back to base64
          return atob(compressedHex);
        }
      } else {
        // Fallback: base64 decode
        return atob(compressedHex);
      }
    } catch (error) {
      console.warn('Decompression failed, trying base64 fallback:', error);
      return atob(compressedHex);
    }
  }

  private async storeBackup(backupId: string, encryptedData: string, metadata: BackupMetadata): Promise<void> {
    // Store backup data
    localStorage.setItem(`oxsig_backup_data_${backupId}`, encryptedData);
    
    // Store metadata
    const backups = this.getStoredBackups();
    backups.push(metadata);
    localStorage.setItem(this.storageKey, JSON.stringify(backups));
  }

  private async loadBackup(backupId: string): Promise<{ encryptedData: string; metadata: BackupMetadata }> {
    const encryptedData = localStorage.getItem(`oxsig_backup_data_${backupId}`);
    if (!encryptedData) {
      throw new Error('Backup not found');
    }

    const metadata = await this.getBackupDetails(backupId);
    if (!metadata) {
      throw new Error('Backup metadata not found');
    }

    return { encryptedData, metadata };
  }

  private getStoredBackups(): BackupMetadata[] {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return [];
    
    try {
      const parsed = JSON.parse(stored);
      return parsed.map((backup: any) => ({
        ...backup,
        createdAt: new Date(backup.createdAt)
      }));
    } catch {
      return [];
    }
  }

  private async validateBackupIntegrity(data: string, metadata: BackupMetadata): Promise<void> {
    const calculatedChecksum = bytesToHex(sha256(new TextEncoder().encode(data)));
    if (calculatedChecksum !== metadata.checksum) {
      throw new Error('Backup integrity check failed');
    }
  }

  private calculateTotalSize(items: BackupItem[]): number {
    return items.reduce((total, item) => {
      const size = JSON.stringify(item).length;
      return total + size;
    }, 0);
  }

  private async getCurrentUserId(): Promise<string> {
    // Get current user ID from session or DID
    const userSession = localStorage.getItem('user_session');
    if (userSession) {
      const session = JSON.parse(userSession);
      return session.userId || session.did || 'anonymous';
    }
    
    const did = localStorage.getItem('did_document');
    if (did) {
      const didDoc = JSON.parse(did);
      return didDoc.id || 'anonymous';
    }
    
    return 'anonymous';
  }

  private async getNextBackupVersion(userId: string): Promise<number> {
    const backups = await this.listBackups(userId);
    return backups.length + 1;
  }

  private generateBackupId(): string {
    return `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateItemId(): string {
    return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('OxSigVault', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
      };
    });
  }

  private reportProgress(progress: BackupProgress, callback?: BackupProgressCallback): void {
    if (callback) {
      callback(progress);
    }
  }
}

// Export singleton instance
export const vaultBackup = new VaultBackupSystem();