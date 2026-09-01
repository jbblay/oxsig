/**
 * Audit Logging Utility
 * Logs sensitive operations to database for security tracking
 */

import { getPool } from '@/lib/db/pool';

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

/**
 * Log an audit entry to database
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.userId || null,
        entry.action,
        entry.resourceType || null,
        entry.resourceId || null,
        entry.ipAddress || null,
        entry.userAgent || null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ]
    );
  } catch (error) {
    // Don't fail the request if audit logging fails, but log the error
    console.error('Audit logging failed:', error);
  }
}

/**
 * Extract IP and user agent from request
 */
export function getRequestMetadata(request: Request | { headers: { get(name: string): string | null } }): {
  ipAddress?: string;
  userAgent: string;
} {
  const headers = request.headers;
  
  const ipAddress = 
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    undefined;
  
  const userAgent = headers.get('user-agent') || 'unknown';
  
  return { ipAddress, userAgent };
}

/**
 * Audit action types for common operations
 */
export const AUDIT_ACTIONS = {
  // Authentication
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILED: 'auth.login.failed',
  LOGOUT: 'auth.logout',
  REGISTER: 'auth.register',
  PASSWORD_CHANGE: 'auth.password.change',
  PASSWORD_RESET: 'auth.password.reset',
  PROFILE_UPDATE: 'profile.update',
  
  // Documents
  DOCUMENT_CREATE: 'document.create',
  DOCUMENT_VIEW: 'document.view',
  DOCUMENT_UPDATE: 'document.update',
  DOCUMENT_DELETE: 'document.delete',
  DOCUMENT_DOWNLOAD: 'document.download',

  // Secure Canvas / Storyboards
  STORYBOARD_CREATE: 'storyboard.create',
  STORYBOARD_OPEN: 'storyboard.open',
  STORYBOARD_UPDATE: 'storyboard.update',
  STORYBOARD_DELETE: 'storyboard.delete',
  STORYBOARD_AUDIO_OPEN: 'storyboard.audio.open',
  STORYBOARD_SHARE: 'storyboard.share',
  STORYBOARD_REVOKE: 'storyboard.share.revoke',
  STORYBOARD_RECORDING_SAVED: 'storyboard.recording.saved',

  // Isolated cyber labs
  LAB_CREATE: 'lab.create',
  LAB_START: 'lab.start',
  LAB_STOP: 'lab.stop',
  LAB_RESET: 'lab.reset',
  LAB_DESTROY: 'lab.destroy',
  LAB_COMMAND: 'lab.command',
  
  // Signatures
  SIGNATURE_CREATE: 'signature.create',
  SIGNATURE_VERIFY: 'signature.verify',
  SIGNATURE_REVOKE: 'signature.revoke',
  
  // Keys
  KEY_GENERATE: 'key.generate',
  KEY_ROTATE: 'key.rotate',
  KEY_EXPORT: 'key.export',
  
  // Admin
  USER_UPDATE: 'admin.user.update',
  USER_DELETE: 'admin.user.delete',
  ROLE_CHANGE: 'admin.role.change',
} as const;

/**
 * Helper to log authentication events
 */
export async function logAuthEvent(
  action: string,
  userId: string | null,
  request: Request | { headers: { get(name: string): string | null } },
  success: boolean,
  metadata?: Record<string, any>
): Promise<void> {
  const { ipAddress, userAgent } = getRequestMetadata(request);
  
  await logAudit({
    userId: userId || undefined,
    action,
    ipAddress,
    userAgent,
    metadata: {
      success,
      ...metadata,
    },
  });
}

/**
 * Helper to log document events
 */
export async function logDocumentEvent(
  action: string,
  userId: string,
  documentId: string,
  request: Request | { headers: { get(name: string): string | null } },
  metadata?: Record<string, any>
): Promise<void> {
  const { ipAddress, userAgent } = getRequestMetadata(request);
  
  await logAudit({
    userId,
    action,
    resourceType: 'document',
    resourceId: documentId,
    ipAddress,
    userAgent,
    metadata,
  });
}

/**
 * Helper to log signature events
 */
export async function logSignatureEvent(
  action: string,
  userId: string,
  signatureId: string,
  request: Request | { headers: { get(name: string): string | null } },
  metadata?: Record<string, any>
): Promise<void> {
  const { ipAddress, userAgent } = getRequestMetadata(request);
  
  await logAudit({
    userId,
    action,
    resourceType: 'signature',
    resourceId: signatureId,
    ipAddress,
    userAgent,
    metadata,
  });
}
