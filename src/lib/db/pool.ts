import { Pool, type PoolClient, type PoolConfig, type QueryResult } from 'pg';

let pool: Pool | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabaseConfig(overrides: PoolConfig = {}): PoolConfig {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  return {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...overrides,
  };
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getDatabaseConfig());
    pool.on('error', (error) => console.error('Unexpected database pool error:', error));
  }
  return pool;
}

export function query(text: string, params?: any[]): Promise<QueryResult> {
  return getPool().query(text, params);
}

export function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export async function checkConnection(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
}
