import { getPool } from '@/lib/db/pool';
import { recordLearningActivity } from '@/lib/learning/activity';

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

const LEARNING_LAB_ACTIONS = new Set([
  'lab.command',
  'lab.session.start',
]);

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
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
    console.error('Audit logging failed:', error);
  }

  if (entry.userId && entry.resourceType === 'lab' && LEARNING_LAB_ACTIONS.has(entry.action)) {
    await recordLearningActivity(entry.userId, 'lab');
  }
}

export function getRequestMetadata(request: Request | { headers: { get(name: string): string | null } }) {
  return {
    ipAddress:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      undefined,
    userAgent: request.headers.get('user-agent') || 'unknown',
  };
}

export const AUDIT_ACTIONS = {
  STORYBOARD_CREATE: 'storyboard.create',
  STORYBOARD_OPEN: 'storyboard.open',
  STORYBOARD_UPDATE: 'storyboard.update',
  STORYBOARD_DELETE: 'storyboard.delete',
  STORYBOARD_AUDIO_OPEN: 'storyboard.audio.open',
  STORYBOARD_SHARE: 'storyboard.share',
  STORYBOARD_REVOKE: 'storyboard.share.revoke',
  STORYBOARD_RECORDING_SAVED: 'storyboard.recording.saved',
  LAB_CREATE: 'lab.create',
  LAB_START: 'lab.start',
  LAB_STOP: 'lab.stop',
  LAB_DESTROY: 'lab.destroy',
  LAB_COMMAND: 'lab.command',
  LAB_COMMAND_FAILED: 'lab.command.failed',
  LAB_SESSION_START: 'lab.session.start',
  LAB_SESSION_START_FAILED: 'lab.session.start.failed',
  LAB_SESSION_END: 'lab.session.end',
  DEPLOYMENT_EXECUTE: 'deployment.execute',
  DEPLOYMENT_EXECUTE_FAILED: 'deployment.execute.failed',
} as const;