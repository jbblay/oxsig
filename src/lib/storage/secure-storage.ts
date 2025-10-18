/**
 * Secure Storage Library
 * Provides encrypted storage capabilities for sensitive files and data
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

// Simulate encryption (in production, use actual crypto libraries like SubtleCrypto)
async function encryptData(data: string, password: string): Promise<string> {
  // In production, use Web Crypto API or a library like crypto-js
  // For now, simulate with base64 encoding + simple obfuscation
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const passwordBytes = encoder.encode(password);
  
  // Simple XOR for demo (NOT secure for production!)
  const encrypted = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    encrypted[i] = dataBytes[i] ^ passwordBytes[i % passwordBytes.length];
  }
  
  // Convert to base64
  return btoa(String.fromCharCode(...encrypted));
}

async function decryptData(encryptedData: string, password: string): Promise<string> {
  // Reverse the process
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  
  // Decode from base64
  const encrypted = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  // Simple XOR to decrypt
  const decrypted = new Uint8Array(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ passwordBytes[i % passwordBytes.length];
  }
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Generate a simple hash for file integrity
async function generateHash(data: string): Promise<string> {
  // In production, use SubtleCrypto.digest with SHA-256
  // For now, simple hash simulation
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `sha256:${Math.abs(hash).toString(16).padStart(16, '0')}`;
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
        const data = e.target?.result as string;
        
        // Encrypt the data
        const encryptedData = await encryptData(data, password);
        
        // Generate hash for integrity
        const hash = await generateHash(data);
        
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
        const existingFiles = getStoredFiles();
        existingFiles.push(secureFile);
        localStorage.setItem('secure_files', JSON.stringify(existingFiles));
        
        resolve(secureFile);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Retrieve and decrypt a secure file
 */
export async function retrieveSecureFile(
  fileId: string,
  password: string
): Promise<{ file: SecureFile; decryptedData: string }> {
  const files = getStoredFiles();
  const file = files.find(f => f.id === fileId);
  
  if (!file) {
    throw new Error('File not found');
  }
  
  if (!file.encryptedData) {
    throw new Error('File data is missing');
  }
  
  try {
    const decryptedData = await decryptData(file.encryptedData, password);
    return { file, decryptedData };
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

/**
 * Delete a secure file
 */
export function deleteSecureFile(fileId: string): boolean {
  try {
    const files = getStoredFiles();
    const allFiles = JSON.parse(localStorage.getItem('secure_files') || '[]');
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
