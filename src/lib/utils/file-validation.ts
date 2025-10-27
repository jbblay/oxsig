/**
 * File Upload Validation Utilities
 * Security checks for file uploads
 */

// Maximum file sizes (in bytes)
export const FILE_SIZE_LIMITS = {
  IMAGE: 10 * 1024 * 1024, // 10 MB
  DOCUMENT: 50 * 1024 * 1024, // 50 MB
  VIDEO: 500 * 1024 * 1024, // 500 MB
  AUDIO: 100 * 1024 * 1024, // 100 MB
  ARCHIVE: 100 * 1024 * 1024, // 100 MB
  DEFAULT: 25 * 1024 * 1024, // 25 MB
} as const;

// Allowed MIME types by category
export const ALLOWED_MIME_TYPES = {
  IMAGE: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ],
  DOCUMENT: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/json',
  ],
  VIDEO: [
    'video/mp4',
    'video/mpeg',
    'video/webm',
    'video/quicktime',
  ],
  AUDIO: [
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/ogg',
  ],
  ARCHIVE: [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
  ],
} as const;

// Dangerous file extensions to block
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.scr', '.pif',
  '.vbs', '.js', '.jar', '.app', '.deb', '.rpm',
  '.sh', '.bash', '.ps1', '.msi', '.dll', '.so',
];

// Dangerous MIME types to block
const BLOCKED_MIME_TYPES = [
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sharedlib',
  'application/x-sh',
  'application/x-bat',
  'text/x-shellscript',
];

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

export interface FileValidationOptions {
  maxSize?: number;
  allowedTypes?: string[];
  category?: keyof typeof ALLOWED_MIME_TYPES;
  checkMagicBytes?: boolean;
}

/**
 * Validate file upload
 */
export function validateFile(
  file: File,
  options: FileValidationOptions = {}
): FileValidationResult {
  const warnings: string[] = [];
  
  // 1. Check file name
  if (!file.name || file.name.length > 255) {
    return {
      valid: false,
      error: 'Invalid file name (must be 1-255 characters)',
    };
  }
  
  // 2. Check for dangerous extensions
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension && BLOCKED_EXTENSIONS.includes(`.${extension}`)) {
    return {
      valid: false,
      error: `File type .${extension} is not allowed for security reasons`,
    };
  }
  
  // 3. Check MIME type against blocklist
  if (BLOCKED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'File type is not allowed for security reasons',
    };
  }
  
  // 4. Check allowed MIME types
  if (options.allowedTypes) {
    if (!options.allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} is not allowed. Allowed types: ${options.allowedTypes.join(', ')}`,
      };
    }
  } else if (options.category) {
    const allowedForCategory = ALLOWED_MIME_TYPES[options.category];
    // Type assertion needed because of readonly array from const assertion
    if (!(allowedForCategory as readonly string[]).includes(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} is not allowed in category ${options.category}`,
      };
    }
  }
  
  // 5. Check file size
  const maxSize = options.maxSize || 
    (options.category ? FILE_SIZE_LIMITS[options.category as keyof typeof FILE_SIZE_LIMITS] : FILE_SIZE_LIMITS.DEFAULT);
  
  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${fileSizeMB} MB) exceeds maximum allowed size (${maxSizeMB} MB)`,
    };
  }
  
  // 6. Check if file is empty
  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty',
    };
  }
  
  // 7. Warn about large files
  if (file.size > 10 * 1024 * 1024) {
    warnings.push('Large file - upload may take some time');
  }
  
  // 8. Check file extension matches MIME type
  const mimeExtension = getMimeExtension(file.type);
  if (mimeExtension && extension !== mimeExtension) {
    warnings.push('File extension does not match MIME type');
  }
  
  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validate file from buffer (server-side)
 */
export async function validateFileBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  options: FileValidationOptions = {}
): Promise<FileValidationResult> {
  const warnings: string[] = [];
  
  // 1. Check buffer size
  if (buffer.length === 0) {
    return { valid: false, error: 'File is empty' };
  }
  
  const maxSize = options.maxSize || FILE_SIZE_LIMITS.DEFAULT;
  if (buffer.length > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
    const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${fileSizeMB} MB) exceeds maximum (${maxSizeMB} MB)`,
    };
  }
  
  // 2. Check magic bytes (file signature) if enabled
  if (options.checkMagicBytes !== false) {
    const actualType = detectFileType(buffer);
    if (actualType && actualType !== mimeType) {
      warnings.push(`File content (${actualType}) does not match declared type (${mimeType})`);
    }
  }
  
  // 3. Check filename
  if (!filename || filename.length > 255) {
    return { valid: false, error: 'Invalid filename' };
  }
  
  // 4. Check extension
  const extension = filename.toLowerCase().split('.').pop();
  if (extension && BLOCKED_EXTENSIONS.includes(`.${extension}`)) {
    return {
      valid: false,
      error: `File type .${extension} is not allowed`,
    };
  }
  
  // 5. Check MIME type
  if (BLOCKED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: 'File type is not allowed for security reasons',
    };
  }
  
  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Detect file type from magic bytes (file signature)
 */
function detectFileType(buffer: Buffer): string | null {
  // Check first few bytes for common file signatures
  const signatures: Record<string, { bytes: number[]; offset: number; mimeType: string }> = {
    // Images
    png: { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0, mimeType: 'image/png' },
    jpg: { bytes: [0xff, 0xd8, 0xff], offset: 0, mimeType: 'image/jpeg' },
    gif87: { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], offset: 0, mimeType: 'image/gif' },
    gif89: { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], offset: 0, mimeType: 'image/gif' },
    webp: { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, mimeType: 'image/webp' },
    
    // Documents
    pdf: { bytes: [0x25, 0x50, 0x44, 0x46], offset: 0, mimeType: 'application/pdf' },
    zip: { bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0, mimeType: 'application/zip' },
    
    // Archives
    gzip: { bytes: [0x1f, 0x8b], offset: 0, mimeType: 'application/gzip' },
    '7z': { bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], offset: 0, mimeType: 'application/x-7z-compressed' },
  };
  
  for (const [_name, sig] of Object.entries(signatures)) {
    const matches = sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte);
    if (matches) {
      return sig.mimeType;
    }
  }
  
  return null;
}

/**
 * Get file extension from MIME type
 */
function getMimeExtension(mimeType: string): string | null {
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/json': 'json',
    'application/zip': 'zip',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
  };
  
  return mimeMap[mimeType] || null;
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename: string): string {
  // Remove path traversal attempts
  let sanitized = filename.replace(/\.\./g, '');
  
  // Remove special characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, '');
  
  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.split('.').pop();
    const name = sanitized.substring(0, 255 - (ext?.length || 0) - 1);
    sanitized = ext ? `${name}.${ext}` : name;
  }
  
  return sanitized;
}

/**
 * Generate safe filename with timestamp
 */
export function generateSafeFilename(originalFilename: string): string {
  const sanitized = sanitizeFilename(originalFilename);
  const timestamp = Date.now();
  const extension = sanitized.split('.').pop();
  const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'));
  
  return `${timestamp}-${nameWithoutExt}.${extension}`;
}
