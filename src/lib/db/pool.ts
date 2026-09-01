/**
 * PostgreSQL Connection Pool
 *
 * Supports a single DATABASE_URL for hosted PostgreSQL providers while
 * preserving the existing POSTGRES_* variables for local Docker development.
 */

import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

/**
 * Resolve the hosted database URL used by the current deployment.
 *
 * DATABASE_URL remains the canonical application setting. Vercel's managed
 * Neon integration exposes the same pooled connection as
 * DATABASE_POSTGRES_URL, so accept it as a provider-specific fallback instead
 * of requiring a duplicate manually managed secret.
 */
export function getHostedDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.DATABASE_POSTGRES_URL;
}

export function isDatabaseConfigured(): boolean {
  if (getHostedDatabaseUrl()) return true;
  if (process.env.POSTGRES_HOST) return true;
  return process.env.NODE_ENV !== 'production';
}

function getSslConfig(): PoolConfig['ssl'] | undefined {
  const setting = process.env.POSTGRES_SSL?.toLowerCase();

  if (!setting) return undefined;
  if (setting === 'false' || setting === 'disable') return false;

  if (setting === 'true' || setting === 'require') {
    return {
      rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED === 'true',
    };
  }

  return undefined;
}

/**
 * Get database configuration from environment.
 *
 * Production must explicitly provide DATABASE_URL or POSTGRES_HOST rather than
 * silently attempting to connect to localhost inside a serverless runtime.
 */
export function getDatabaseConfig(overrides: PoolConfig = {}): PoolConfig {
  const ssl = getSslConfig();
  const hostedDatabaseUrl = getHostedDatabaseUrl();

  if (hostedDatabaseUrl) {
    return {
      connectionString: hostedDatabaseUrl,
      ...(ssl !== undefined ? { ssl } : {}),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ...overrides,
    };
  }

  if (process.env.NODE_ENV === 'production' && !process.env.POSTGRES_HOST) {
    throw new Error(
      'Database is not configured. Set DATABASE_URL, DATABASE_POSTGRES_URL, or POSTGRES_HOST in the production environment.'
    );
  }

  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'oxsig',
    user: process.env.POSTGRES_USER || 'oxsig',
    password: process.env.POSTGRES_PASSWORD || 'oxsig_secure_password',
    ...(ssl !== undefined ? { ssl } : {}),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ...overrides,
  };
}

/**
 * Get or create the connection pool.
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getDatabaseConfig());

    pool.on('error', (err) => {
      // Do not terminate a Vercel/serverless process because one idle connection
      // failed. The pool can establish another connection on the next request.
      console.error('Unexpected error on idle database client', err);
    });

    console.log('Database connection pool initialized');
  }

  return pool;
}

/**
 * Close the connection pool.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database connection pool closed');
  }
}

/**
 * Check database connection.
 */
export async function checkConnection(): Promise<boolean> {
  let client;

  try {
    client = await getPool().connect();
    await client.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  } finally {
    client?.release();
  }
}
