import pg from 'pg';

const { Client } = pg;
const applicationConnectionString =
  process.env.DATABASE_URL || process.env.DATABASE_POSTGRES_URL;

if (!applicationConnectionString) {
  console.error(
    'DATABASE_URL or DATABASE_POSTGRES_URL is required for the auth database bootstrap.'
  );
  process.exit(1);
}

function getMigrationConnectionString() {
  const directConnectionString =
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_POSTGRES_URL_NON_POOLING;

  if (directConnectionString) {
    return directConnectionString;
  }

  // Neon pooled URLs use a hostname containing "-pooler". Schema changes are
  // safer over the matching direct endpoint, while the application should keep
  // using the pooled DATABASE_URL for normal serverless traffic.
  const url = new URL(applicationConnectionString);
  if (url.hostname.includes('-pooler.')) {
    url.hostname = url.hostname.replace('-pooler.', '.');
  }
  return url.toString();
}

const client = new Client({
  connectionString: getMigrationConnectionString(),
  enableChannelBinding: true,
});

async function main() {
  await client.connect();

  // Keep this bootstrap intentionally small and idempotent. It creates only the
  // schema required by signup/login/session handling.
  await client.query('BEGIN');
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        public_key TEXT UNIQUE,
        display_name VARCHAR(255),
        email VARCHAR(255),
        password_hash TEXT,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        is_active BOOLEAN NOT NULL DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        two_factor_enabled BOOLEAN DEFAULT false,
        bio TEXT,
        avatar_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ,
        last_seen_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `);

    // Upgrade an older users table without assuming which migration created it.
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT');
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'");
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ');
    await client.query('ALTER TABLE users ALTER COLUMN public_key DROP NOT NULL');

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_auth_unique
      ON users (lower(email))
      WHERE email IS NOT NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token TEXT NOT NULL UNIQUE,
        device_info TEXT,
        ip_address INET,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)');

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50),
        resource_id UUID,
        ip_address INET,
        user_agent TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)');

    await client.query(`
      CREATE TABLE IF NOT EXISTS oxisg_auth_bootstrap (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('INSERT INTO oxisg_auth_bootstrap (version) VALUES (1) ON CONFLICT (version) DO NOTHING');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  const verification = await client.query(`
    SELECT
      to_regclass('public.users') IS NOT NULL AS users_table,
      to_regclass('public.sessions') IS NOT NULL AS sessions_table,
      to_regclass('public.audit_logs') IS NOT NULL AS audit_logs_table,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash'
      ) AS password_hash_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
      ) AS role_column
  `);

  const readiness = verification.rows[0];
  if (
    !readiness.users_table ||
    !readiness.sessions_table ||
    !readiness.audit_logs_table ||
    !readiness.password_hash_column ||
    !readiness.role_column
  ) {
    throw new Error('Authentication schema verification failed after bootstrap.');
  }

  console.log('Authentication database bootstrap complete and verified.');
}

main()
  .catch((error) => {
    console.error('Authentication database bootstrap failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => undefined);
  });
