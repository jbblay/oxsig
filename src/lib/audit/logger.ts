/**
 * Audit Logging Utility
 * Logs sensitive operations to database for security tracking
 */

import { getPool } from '@/lib/db/pool';
import { getClientIp, getUserAgent } from '@/lib/http/client-info';

interface AuditLogEntry {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit entry to database
 */
async function logAudit(entry: AuditLogEntry): Promise<void> {
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
        JSON.stringify(entry.metadata ?? {}),
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
function getRequestMetadata(request: Request | { headers: { get(name: string): string | null } }): {
  ipAddress?: string;
  userAgent?: string;
} {
  return {
    ipAddress: getClientIp(request) ?? undefined,
    userAgent: getUserAgent(request) ?? undefined,
  };
}

/**
 * Audit action types for common operations
 */
export const AUDIT_ACTIONS = {
  // Authentication
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILED: 'auth.login.failed',
  REGISTER: 'auth.register',
  DOCUMENT_CREATE: 'document.create',
  DOCUMENT_DELETE: 'document.delete',
  DOCUMENT_DOWNLOAD: 'document.download',
  SIGNATURE_CREATE: 'signature.create',
  SIGNATURE_VERIFY: 'signature.verify',
} as const;

/**
 * Helper to log authentication events
 */
export async function logAuthEvent(
  action: string,
  userId: string | null,
  request: Request | { headers: { get(name: string): string | null } },
  success: boolean,
  metadata?: Record<string, unknown>
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
  metadata?: Record<string, unknown>
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
  metadata?: Record<string, unknown>
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
