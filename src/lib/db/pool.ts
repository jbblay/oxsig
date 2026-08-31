/**
 * PostgreSQL Connection Pool
 * 
 * Manages database connections for the application
 */

import { Pool, PoolConfig, type PoolClient, type QueryResult } from 'pg';

let pool: Pool | null = null;

/**
 * Get database configuration from environment
 */
function getConfig(): PoolConfig {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }
  if (process.env.NODE_ENV === 'production') {
    const required = [
      process.env.POSTGRES_HOST,
      process.env.POSTGRES_DB,
      process.env.POSTGRES_USER,
      process.env.POSTGRES_PASSWORD,
    ];
    const localDatabase = ['localhost', '127.0.0.1', 'postgres'].includes(process.env.POSTGRES_HOST || '');
    if (
      required.some((value) => !value) ||
      (process.env.POSTGRES_PASSWORD === 'oxsig_secure_password' && !localDatabase)
    ) {
      throw new Error('Production PostgreSQL configuration is missing or uses development credentials');
    }
  }
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'oxsig',
    user: process.env.POSTGRES_USER || 'oxsig',
    password: process.env.POSTGRES_PASSWORD || 'oxsig_secure_password',
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Return error after 10 seconds if can't connect
  };
}

/**
 * Get or create the connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getConfig());
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle database client', err);
    });
  }
  
  return pool;
}

export async function query(text: string, params?: any[]): Promise<QueryResult> {
  return getPool().query(text, params);
}

async function getClient(): Promise<PoolClient> {
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
