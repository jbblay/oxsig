import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock('./clerk-config', () => ({ isClerkConfigured: () => true }));
vi.mock('./e2e-auth', () => ({ isE2EAuthEnabled: () => false, getE2EAuthenticatedUserFromCookies: vi.fn() }));

type UserRow = {
  id: string;
  clerk_user_id: string;
  email: string | null;
  email_verified: boolean;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  public_key: string | null;
  is_active: boolean;
  clerk_source_updated_at: Date | null;
};

const db = vi.hoisted(() => ({
  schemaReady: true,
  users: [] as any[],
  tombstones: new Set<string>(),
  deliveries: new Set<string>(),
  failNextUserWrite: false,
  nextId: 1,
}));

function handleQuery(sql: string, params: any[] = []) {
  const text = sql.replace(/\s+/g, ' ').trim();
  const rows = (list: unknown[]) => ({ rows: list, rowCount: list.length });

  if (text.includes("to_regclass('public.clerk_identity_tombstones')")) {
    return rows([{ tombstones: db.schemaReady, deliveries: db.schemaReady, source_updated_at: db.schemaReady }]);
  }
  if (text.startsWith('SELECT 1 FROM clerk_identity_tombstones')) {
    return rows(db.tombstones.has(params[0]) ? [{ '?column?': 1 }] : []);
  }
  if (text.startsWith('INSERT INTO clerk_identity_tombstones')) {
    db.tombstones.add(params[0]);
    return rows([]);
  }
  if (text.startsWith('SELECT 1 FROM clerk_webhook_deliveries')) {
    return rows(db.deliveries.has(params[0]) ? [{ '?column?': 1 }] : []);
  }
  if (text.startsWith('INSERT INTO clerk_webhook_deliveries')) {
    db.deliveries.add(params[0]);
    return rows([]);
  }
  if (text.startsWith('DELETE FROM clerk_webhook_deliveries')) return rows([]);

  if (text.startsWith('UPDATE users SET is_active = false')) {
    const matched = db.users.filter((user: UserRow) => user.clerk_user_id === params[0]);
    matched.forEach((user: UserRow) => { user.is_active = false; });
    return rows(matched);
  }
  if (text.startsWith('UPDATE users SET clerk_source_updated_at = $2 WHERE id = $1')) {
    const user = db.users.find((candidate: UserRow) => candidate.id === params[0]);
    if (user) user.clerk_source_updated_at = params[1];
    return rows([]);
  }
  if (text.startsWith('UPDATE users SET email = COALESCE($2, email)')) {
    if (db.failNextUserWrite) {
      db.failNextUserWrite = false;
      throw new Error('database unavailable');
    }
    const user = db.users.find((candidate: UserRow) => candidate.clerk_user_id === params[0] && candidate.is_active);
    if (!user) return rows([]);
    const incoming: Date | undefined = params[5];
    if (incoming && user.clerk_source_updated_at && user.clerk_source_updated_at > incoming) return rows([]);
    if (params[1] !== null) {
      user.email = params[1];
      user.email_verified = params[2];
    }
    if (incoming) user.clerk_source_updated_at = incoming;
    return rows([user]);
  }
  if (text.startsWith('SELECT id FROM users WHERE clerk_user_id IS NULL')) return rows([]);
  if (text.startsWith('INSERT INTO users')) {
    if (db.users.some((user: UserRow) => user.clerk_user_id === params[0])) return rows([]);
    const user: UserRow = {
      id: `user-${db.nextId++}`,
      clerk_user_id: params[0],
      email: params[1],
      email_verified: params[2],
      display_name: params[3],
      avatar_url: params[4],
      role: 'user',
      public_key: null,
      is_active: true,
      clerk_source_updated_at: null,
    };
    db.users.push(user);
    return rows([user]);
  }
  if (/^SELECT .* FROM users WHERE clerk_user_id ?= ?\$1 AND is_active ?= ?true/.test(text)) {
    return rows(db.users.filter((user: UserRow) => user.clerk_user_id === params[0] && user.is_active));
  }
  if (/^SELECT .* FROM users WHERE clerk_user_id = \$1 LIMIT 1/.test(text)) {
    return rows(db.users.filter((user: UserRow) => user.clerk_user_id === params[0]));
  }
  throw new Error(`Unexpected SQL in test: ${text.slice(0, 120)}`);
}

vi.mock('@/lib/db/pool', () => ({
  getPool: () => ({ query: async (sql: string, params?: any[]) => handleQuery(sql, params) }),
}));

import { processClerkWebhookEvent } from './clerk-webhook';
import { resetIdentityLifecycleSchemaCache, upsertClerkUser } from './clerk-user';

function userEvent(type: 'user.created' | 'user.updated', id: string, email: string, updatedAt: number) {
  return {
    type,
    data: {
      id,
      email_addresses: [{ id: 'email-1', email_address: email, verification: { status: 'verified' } }],
      primary_email_address_id: 'email-1',
      first_name: 'Ada',
      last_name: 'Lovelace',
      username: null,
      image_url: null,
      updated_at: updatedAt,
    },
  };
}

beforeEach(() => {
  db.schemaReady = true;
  db.users = [];
  db.tombstones = new Set();
  db.deliveries = new Set();
  db.failNextUserWrite = false;
  db.nextId = 1;
  resetIdentityLifecycleSchemaCache();
});

describe('Clerk webhook lifecycle', () => {
  it('creates an account on user.created and acknowledges duplicates without reprocessing', async () => {
    await expect(processClerkWebhookEvent(userEvent('user.created', 'clerk_1', 'ada@example.com', 1000), 'msg_1')).resolves.toBe('synced');
    await expect(processClerkWebhookEvent(userEvent('user.created', 'clerk_1', 'ada@example.com', 1000), 'msg_1')).resolves.toBe('duplicate');
    expect(db.users).toHaveLength(1);
  });

  it('ignores an older user.updated that arrives after a newer one', async () => {
    await processClerkWebhookEvent(userEvent('user.created', 'clerk_1', 'old@example.com', 1000), 'msg_1');
    await processClerkWebhookEvent(userEvent('user.updated', 'clerk_1', 'new@example.com', 3000), 'msg_3');
    await processClerkWebhookEvent(userEvent('user.updated', 'clerk_1', 'old@example.com', 2000), 'msg_2');

    expect(db.users[0].email).toBe('new@example.com');
  });

  it('never resurrects a deleted identity when user.deleted arrives before user.created', async () => {
    await expect(processClerkWebhookEvent({ type: 'user.deleted', data: { id: 'clerk_9' } }, 'msg_del')).resolves.toBe('deactivated');
    await expect(processClerkWebhookEvent(userEvent('user.created', 'clerk_9', 'gone@example.com', 1000), 'msg_new'))
      .resolves.toBe('ignored_retired_identity');

    expect(db.users).toHaveLength(0);
    expect(db.tombstones.has('clerk_9')).toBe(true);
  });

  it('acknowledges updates for deactivated accounts instead of failing forever', async () => {
    await processClerkWebhookEvent(userEvent('user.created', 'clerk_1', 'ada@example.com', 1000), 'msg_1');
    await processClerkWebhookEvent({ type: 'user.deleted', data: { id: 'clerk_1' } }, 'msg_2');

    await expect(processClerkWebhookEvent(userEvent('user.updated', 'clerk_1', 'ada@example.com', 3000), 'msg_3'))
      .resolves.toBe('ignored_retired_identity');
    expect(db.users[0].is_active).toBe(false);
  });

  it('does not record a delivery when processing fails, so the retry is processed', async () => {
    await processClerkWebhookEvent(userEvent('user.created', 'clerk_1', 'ada@example.com', 1000), 'msg_1');
    db.failNextUserWrite = true;

    await expect(processClerkWebhookEvent(userEvent('user.updated', 'clerk_1', 'b@example.com', 2000), 'msg_2'))
      .rejects.toThrow('database unavailable');
    expect(db.deliveries.has('msg_2')).toBe(false);

    await expect(processClerkWebhookEvent(userEvent('user.updated', 'clerk_1', 'b@example.com', 2000), 'msg_2')).resolves.toBe('synced');
    expect(db.users[0].email).toBe('b@example.com');
  });

  it('keeps working before migration 058 is applied', async () => {
    db.schemaReady = false;
    await expect(processClerkWebhookEvent(userEvent('user.created', 'clerk_1', 'ada@example.com', 1000), 'msg_1')).resolves.toBe('synced');
    await expect(processClerkWebhookEvent({ type: 'user.deleted', data: { id: 'clerk_1' } }, 'msg_2')).resolves.toBe('deactivated');
    expect(db.users[0].is_active).toBe(false);
  });

  it('acknowledges unrelated event types', async () => {
    await expect(processClerkWebhookEvent({ type: 'session.created', data: { id: 'sess_1' } }, 'msg_s')).resolves.toBe('ignored_event_type');
  });
});

describe('upsertClerkUser', () => {
  it('refuses to provision a tombstoned identity (e.g. a session that outlived self-service deletion)', async () => {
    db.tombstones.add('clerk_x');
    await expect(upsertClerkUser({ clerkUserId: 'clerk_x', email: 'x@example.com', emailVerified: true }))
      .rejects.toMatchObject({ code: 'CLERK_IDENTITY_RETIRED' });
    expect(db.users).toHaveLength(0);
  });
});
