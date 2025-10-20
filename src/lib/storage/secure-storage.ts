/**
 * Secure Storage Library
 * Provides encrypted storage capabilities for sensitive files and data
 *
 * Changes (Oct 2025):
 * - Replaced demo XOR/base64 with AES-256-GCM + PBKDF2(SHA-256)
 * - Added legacy decrypt fallback for previously stored entries
 * - Fixed retrieval path to read full records including encryptedData
 */

export interface SecureFile {
  id: string;
  name: string;
  size: number;
  type: string;
  encrypted: boolean;
  timestamp: number;
  encryptedData?: string;
  hash?: string;
  tags?: string[];
  description?: string;
}

export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  encryptedFiles: number;
  lastAccessed?: number;
}

// ===== Base64 helpers =====
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ===== Crypto helpers (WebCrypto) =====
async function deriveKeyFromPassword(password: string, salt: Uint8Array, iterations = 150_000): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: ensureArrayBuffer(salt), iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// AES-GCM encrypt: returns format v2:<salt_b64>:<iv_b64>:<ct_b64>
async function encryptDataV2(plaintext: Uint8Array, password: string): Promise<string> {
  if (!(crypto && crypto.subtle)) throw new Error('WebCrypto not available');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassword(password, salt);
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ensureArrayBuffer(iv) }, key, ensureArrayBuffer(plaintext));
  const ct = new Uint8Array(ctBuf);
  return `v2:${toBase64(salt)}:${toBase64(iv)}:${toBase64(ct)}`;
}

async function decryptDataV2(encString: string, password: string): Promise<Uint8Array> {
  if (!encString.startsWith('v2:')) throw new Error('Not v2 payload');
  const [_v, saltB64, ivB64, ctB64] = encString.split(':');
  const salt = fromBase64(saltB64);
  const iv = fromBase64(ivB64);
  const ct = fromBase64(ctB64);
  const key = await deriveKeyFromPassword(password, salt);
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ensureArrayBuffer(iv) }, key, ensureArrayBuffer(ct));
  return new Uint8Array(ptBuf);
}

// Legacy demo XOR decrypt (fallback for previously stored entries)
async function legacyDecryptXorBase64(encryptedData: string, password: string): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password);
  const encrypted = fromBase64(encryptedData);
  const decrypted = new Uint8Array(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ passwordBytes[i % passwordBytes.length];
  }
  return decrypted;
}

// Compute SHA-256 integrity hash (hex)
async function generateHash(bytes: Uint8Array): Promise<string> {
  if (crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', ensureArrayBuffer(bytes));
    const out = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    return `sha256:${out}`;
  }
  // Minimal fallback (not cryptographically strong)
  let h = 0;
  for (let i = 0; i < bytes.length; i++) {
    h = ((h << 5) - h) + bytes[i];
    h |= 0;
  }
  return `sha256:${Math.abs(h).toString(16).padStart(16, '0')}`;
}

// Ensure ArrayBuffer view backing for WebCrypto BufferSource params
function ensureArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.buffer.byteLength === data.byteLength) return data.buffer as ArrayBuffer;
  return data.slice().buffer as ArrayBuffer;
}

/**
 * Store a file securely with encryption
 */
export async function storeSecureFile(
  file: File,
  password: string,
  tags?: string[],
  description?: string
): Promise<SecureFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const result = e.target?.result;
        if (!result) throw new Error('Read failed');
        const bytes = new Uint8Array(result as ArrayBuffer);

        // Encrypt the data (AES-GCM v2)
        const encryptedData = await encryptDataV2(bytes, password);

        // Generate hash for integrity (SHA-256)
        const hash = await generateHash(bytes);
        
        // Create secure file object
        const secureFile: SecureFile = {
          id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          size: file.size,
          type: file.type,
          encrypted: true,
          timestamp: Date.now(),
          encryptedData,
          hash,
          tags,
          description
        };
        
        // Store in localStorage (in production, use IndexedDB or backend)
        const all = getStoredFilesRaw();
        all.push(secureFile);
        localStorage.setItem('secure_files', JSON.stringify(all));
        
        resolve(secureFile);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Retrieve and decrypt a secure file
 */
export async function retrieveSecureFile(
  fileId: string,
  password: string
): Promise<{ file: SecureFile; decryptedData: string }> {
  const files = getStoredFilesRaw();
  const file = files.find(f => f.id === fileId);
  
  if (!file) {
    throw new Error('File not found');
  }
  
  if (!file.encryptedData) {
    throw new Error('File data is missing');
  }
  
  try {
    let bytes: Uint8Array;
    if (file.encryptedData.startsWith('v2:')) {
      bytes = await decryptDataV2(file.encryptedData, password);
    } else {
      // Legacy fallback
      bytes = await legacyDecryptXorBase64(file.encryptedData, password);
    }

    // Return as data URL to keep API stable
    const b64 = toBase64(bytes);
    const mime = file.type || 'application/octet-stream';
    const dataUrl = `data:${mime};base64,${b64}`;
    return { file, decryptedData: dataUrl };
  } catch (error) {
    throw new Error('Decryption failed - incorrect password or corrupted data');
  }
}

/**
 * Get all stored files (without decrypted data)
 */
export function getStoredFiles(): SecureFile[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem('secure_files');
    if (!stored) return [];
    
    const files = JSON.parse(stored) as SecureFile[];
    // Remove encrypted data from the list for memory efficiency
    return files.map(({ encryptedData, ...file }) => file);
  } catch (error) {
    console.error('Error loading secure files:', error);
    return [];
  }
}

// Internal helper to load full records including encryptedData
function getStoredFilesRaw(): SecureFile[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('secure_files');
    if (!stored) return [];
    return JSON.parse(stored) as SecureFile[];
  } catch (e) {
    console.error('Error loading raw secure files:', e);
    return [];
  }
}

/**
 * Delete a secure file
 */
export function deleteSecureFile(fileId: string): boolean {
  try {
    const allFiles = getStoredFilesRaw();
    const filtered = allFiles.filter((f: SecureFile) => f.id !== fileId);
    localStorage.setItem('secure_files', JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

/**
 * Get storage statistics
 */
export function getStorageStats(): StorageStats {
  const files = getStoredFiles();
  
  return {
    totalFiles: files.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
    encryptedFiles: files.filter(f => f.encrypted).length,
    lastAccessed: files.length > 0 
      ? Math.max(...files.map(f => f.timestamp))
      : undefined
  };
}

/**
 * Clear all secure storage
 */
export function clearSecureStorage(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('secure_files');
}

/**
 * Export secure file (download)
 */
export async function exportSecureFile(
  fileId: string,
  password: string
): Promise<void> {
  const { file, decryptedData } = await retrieveSecureFile(fileId, password);
  
  // Create blob and download
  const blob = dataURLtoBlob(decryptedData);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper function to convert data URL to Blob
function dataURLtoBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}
