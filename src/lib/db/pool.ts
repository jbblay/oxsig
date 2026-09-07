import { Pool, type PoolClient, type PoolConfig, type QueryResult } from 'pg';
import { sanitizePostgresParameters } from './postgres-safe';

let pool: Pool | null = null;
const SAFE_CLIENT = Symbol('oxsig-postgres-safe-client');

function sanitizeQueryArgs(args: any[]): any[] {
  if (!args.length) return args;
  const [first, second, ...rest] = args;

  if (typeof first === 'string' && Array.isArray(second)) {
    return [first, sanitizePostgresParameters(second), ...rest];
  }

  if (first && typeof first === 'object' && Array.isArray(first.values)) {
    return [{ ...first, values: sanitizePostgresParameters(first.values) }, second, ...rest];
  }

  return args;
}

function wrapClient(client: PoolClient): PoolClient {
  const safeClient = client as PoolClient & { [SAFE_CLIENT]?: boolean; query: any };
  if (safeClient[SAFE_CLIENT]) return client;

  const originalQuery = client.query.bind(client) as any;
  safeClient.query = (...args: any[]) => originalQuery(...sanitizeQueryArgs(args));
  safeClient[SAFE_CLIENT] = true;
  return client;
}

class SanitizingPool extends Pool {
  query(...args: any[]): any {
    return (Pool.prototype.query as any).apply(this, sanitizeQueryArgs(args));
  }

  connect(...args: any[]): any {
    if (typeof args[0] === 'function') {
      const callback = args[0];
      return (Pool.prototype.connect as any).call(
        this,
        (error: Error | undefined, client: PoolClient | undefined, release: (() => void) | undefined) =>
          callback(error, client ? wrapClient(client) : client, release)
      );
    }

    return (Pool.prototype.connect as any)
      .apply(this, args)
      .then((client: PoolClient) => wrapClient(client));
  }
}

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
    pool = new SanitizingPool(getDatabaseConfig());
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
