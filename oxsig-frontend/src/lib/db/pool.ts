/**
 * PostgreSQL Connection Pool
 * 
 * Manages database connections for the application
 */

import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

/**
 * Get database configuration from environment
 */
function getConfig(): PoolConfig {
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'oxsig',
    user: process.env.POSTGRES_USER || 'oxsig',
    password: process.env.POSTGRES_PASSWORD || 'changeme',
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return error after 2 seconds if can't connect
  };
}

/**
 * Get or create the connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getConfig());
    
    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle database client', err);
      process.exit(-1);
    });
    
    console.log('✅ Database connection pool initialized');
  }
  
  return pool;
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database connection pool closed');
  }
}

/**
 * Check database connection
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
}
