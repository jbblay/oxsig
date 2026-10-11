export type AdminUserStatus = 'active' | 'suspended' | 'deactivated';
export type AdminUserFilter = 'all' | 'active' | 'suspended' | 'admins' | 'new' | 'dormant';
export type AdminUserSort = 'newest' | 'oldest' | 'recently-active' | 'name';
export type AdminResourceFilter = 'live' | 'failed' | 'expired' | 'all';

export interface AdminSeriesPoint {
  date: string;
  value: number;
}

export interface AdminOverview {
  generatedAt: string;
  users: {
    total: number;
    new7d: number;
    new30d: number;
    active24h: number;
    active7d: number;
    active30d: number;
    suspended: number;
    admins: number;
    onboardingPending: number;
  };
  labs: {
    live: number;
    failed24h: number;
    launched30d: number;
    runtimeMinutes30d: number;
    byStatus: Record<string, number>;
  };
  operations: {
    live: number;
    failed24h: number;
    launched30d: number;
    byStatus: Record<string, number>;
  };
  cleanupBacklog: number;
  signups: AdminSeriesPoint[];
  activeUsers: AdminSeriesPoint[];
  labLaunches: AdminSeriesPoint[];
  recentUsers: AdminUserSummary[];
  recentEvents: AdminAuditEvent[];
}

export interface AdminUserSummary {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: 'user' | 'admin';
  isFounder: boolean;
  emailVerified: boolean;
  status: AdminUserStatus;
  suspendedReason: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  onboardedAt: string | null;
  liveResources: number;
  totalLabs: number;
}

export interface AdminUserList {
  users: AdminUserSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminResource {
  kind: 'lab' | 'operation';
  id: string;
  name: string;
  status: string;
  ownerId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  provider: string | null;
  createdAt: string;
  startedAt: string | null;
  expiresAt: string | null;
  lastError: string | null;
  partOfOperation: boolean;
}

export interface AdminUserDetail {
  user: AdminUserSummary & {
    headline: string | null;
    bio: string | null;
    experienceLevel: string | null;
    focusAreas: string[];
    suspendedAt: string | null;
    authProvider: string | null;
  };
  usage: {
    labs: number;
    operations: number;
    runtimeMinutes: number;
    vaultItems: number;
    collaborations: number;
    storyboards: number;
    activeDays30d: number;
  };
  resources: AdminResource[];
  events: AdminAuditEvent[];
}

export interface AdminAuditEvent {
  id: string;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminSystemStatus {
  generatedAt: string;
  environment: { nodeEnv: string; vercelEnv: string | null; region: string | null; commit: string | null; branch: string | null };
  database: { ok: boolean; latencyMs: number | null; migrationsApplied: number; latestMigration: string | null; latestMigrationAt: string | null; pendingAdminMigration: boolean };
  integrations: Array<{ id: string; label: string; configured: boolean; required: boolean; detail: string }>;
  lifecycle: { cleanupBacklog: number; lastCleanupAt: string | null; failedLabs24h: number; failedOperations24h: number };
}

export type AdminUserAction =
  | { action: 'suspend'; reason: string; terminateResources?: boolean }
  | { action: 'restore' }
  | { action: 'set-role'; role: 'user' | 'admin' }
  | { action: 'terminate-resources' };
